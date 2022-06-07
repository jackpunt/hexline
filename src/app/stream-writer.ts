import { stime } from "@thegraid/common-lib";
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
  openPromise: EzPromise<FileSystemWritableFileStream> = this.newOpenPromise;

  get newOpenPromise() {
    return new EzPromise<FileSystemWritableFileStream>()
  }
  async openWriteable(fileHandle: FileSystemFileHandle = this.fileHandle,
    options: FileSystemCreateWritableOptions = { keepExistingData: true }) {
    let writeable = await fileHandle.createWritable(options)
    await writeable.seek((await fileHandle.getFile()).size)
    this.openPromise.fulfill(writeable)
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
      console.log(stime(this, `.picked:`), this.fileHandle, value)
      this.openWriteable()
    })
    this.openPromise = this.newOpenPromise
  }

  async writeLine(text: string, dms = 500) {
    try {
      let line = `${text}\n`
      let stream = (await this.openPromise)     // indicates writeable is ready
      await stream.seek((await this.fileHandle.getFile()).size)
      await stream.write({type: 'write', data: line});
      let closePromise = this.closeFile()       // flush to real-file
      this.openPromise = this.newOpenPromise    // new Promise for next cycle:
      await closePromise
      while (!this.openPromise.value) await this.openWriteable()
    } catch (err) {
      console.warn(stime(this, `.writeLine failed:`), err)
      throw err
    }
  }
  async closeFile() {
    try {
      return (await this.openPromise).close();
    } catch (err) {
      console.warn(stime(this, `.closeFile failed:`), err)
      throw err
    }
  }
  /** multi-purpose picker button: (callback arg-type changes) */
  setButton(method: 'showOpenFilePicker' | 'showSaveFilePicker' | 'showDirectoryPicker',
    options: OpenFilePickerOptions & { multiple?: false; } & SaveFilePickerOptions & DirectoryPickerOptions,
    cb: (fileHandleAry: any) => void) {
    const picker = window[method]  // showSaveFilePicker showDirectoryPicker
    const fsOpenButton = document.getElementById(this.buttonId)
    fsOpenButton.innerText = method.substring(4, method.length - 6)
    fsOpenButton.onclick = () => {
      picker(options).then((value: any) => cb(value), (rej: any) => {
        console.warn(`showOpenFilePicker failed: `, rej)
      });
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