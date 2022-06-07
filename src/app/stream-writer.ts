import { AT, stime } from "@thegraid/common-lib";
import { EzPromise } from "@thegraid/ezpromise";
import {} from "wicg-file-system-access"

export interface ILogWriter {
  writeLine(text: string): void | Promise<void>
}
/**
 * Supply a button-id in HTML, when user clicks the file is opened for write-append.
 * 
 * Other code can: new LogWriter().writeLine('first line...') 
 * to queue writes before user clicks.
 * 
 * file is flushed/closed & re-opened after every writeLine.
 * (so log is already saved if browser crashes...)
 */
export class LogWriter implements ILogWriter {
  fileHandle: FileSystemFileHandle;
  /** contains WriteableFileStream */
  streamPromise: EzPromise<FileSystemWritableFileStream> = this.newOpenPromise;
  get ident() { return AT.ansiText(['red'], `.writeBacklog:`) }

  get newOpenPromise() {
    return new EzPromise<FileSystemWritableFileStream>()
  }
  async openStream(fileHandle: FileSystemFileHandle = this.fileHandle,
    options: FileSystemCreateWritableOptions = { keepExistingData: true }) {
    let stream = await fileHandle.createWritable(options)
    //await writeable.seek((await fileHandle.getFile()).size)
    this.streamPromise.fulfill(stream).then(() => this.writeBacklog())
  }

  constructor(name = 'logFile', public buttonId = "fsOpenFileButton") {
    const options = {
      id: 'logWriter',
      startIn: 'downloads', // documents, desktop, music, pictures, videos
      suggestedName: name,
      types: [{
          description: 'Text Files',
          accept: { 'text/plain': ['.txt'], },
        }, ],
    };
    console.log(stime(this, `.new LogWriter:`), { file: this.fileHandle })
    // Note return type changes: [FileHandle], [DirHandle], FileHandle
    this.setButton('showSaveFilePicker', options, (value) => {
      this.fileHandle = value as FileSystemFileHandle
      console.log(stime(this, `${this.ident}.picked:`), this.fileHandle, value)
      this.openStream()
    }, 'SaveLog')
    this.streamPromise = this.newOpenPromise
  }

  backlog: string = ''
  writeLine(text = '') {
    this.backlog += `${text}\n`
    let stream = this.streamPromise.value as FileSystemWritableFileStream
    if (!stream) {
      return
    } 
    this.writeBacklog() // try write, but do not wait.
  }
  showBacklog() {
    console.log(stime(this, `.showBacklog:\n`), this.backlog)
  }

  closePromise = new EzPromise<number>().fulfill(0) // a filled Promise<void>
  async writeBacklog() {
    //console.log(stime(this, ident), `Backlog:`, this.backlog.length, this.backlog)
    if (this.backlog.length > 0) try {
      await this.closePromise
      this.closePromise = new EzPromise<number>()
      let stream = await this.streamPromise     // indicates writeable is ready
      this.streamPromise = this.newOpenPromise    // new Promise for next cycle:
      await stream.seek((await this.fileHandle.getFile()).size)
      let lines = this.backlog; this.backlog = ''  // would prefer a lock on this.backlog...
      await stream.write({ type: 'write', data: lines }); // write to tmp store
      await stream.close().then(() => this.closePromise.fulfill(1))       // flush to real-file
      while (!this.streamPromise.value) await this.openStream()
      // ASSERT: openPromise is now fulfilled with a new Writeable Stream
    } catch (err) {
      console.warn(stime(this, this.ident), `failed:`, err)
      throw err
    }
  }
  async closeFile() {
    try {
      return (await this.streamPromise).close();
    } catch (err) {
      console.warn(stime(this, `.closeFile failed:`), err)
      throw err
    }
  }
  /** multi-purpose picker button: (callback arg-type changes) */
  setButton(method: 'showOpenFilePicker' | 'showSaveFilePicker' | 'showDirectoryPicker',
    options: OpenFilePickerOptions & { multiple?: false; } & SaveFilePickerOptions & DirectoryPickerOptions,
    cb: (fileHandleAry: any) => void, inText = method.substring(4, method.length - 6)) {
    const picker = window[method]  // showSaveFilePicker showDirectoryPicker
    const fsOpenButton = document.getElementById(this.buttonId)
    fsOpenButton.innerText = inText
    fsOpenButton.onclick = () => {
      picker(options).then((value: any) => cb(value),
        (rej: any) => console.warn(`showOpenFilePicker failed: `, rej)
      );
    }
    return fsOpenButton
  }
  clickButton() {
    const fsOpenButton = document.getElementById(this.buttonId)
    fsOpenButton.click()
  }

  /** Old technique: creates a *new* file each time it saves/downloads the given Blob(text) */
  downloadViaHiddenButton(name: string, text: string) {
    const a = document.createElement('a');
    let blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.addEventListener('click', (e) => {
      setTimeout(() => URL.revokeObjectURL(a.href), 3 * 1000); // is there no completion callback?
    });
    a.click();
  }
}