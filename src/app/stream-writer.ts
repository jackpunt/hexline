import { stime } from "@thegraid/common-lib";
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
  writeablePromise: Promise<FileSystemWritableFileStream> = this.newWriteablePromise;
  writerReady: (value: FileSystemWritableFileStream | PromiseLike<FileSystemWritableFileStream>) => void 
  writerFailed: (reason?: any) => void
  contents: string
  get newWriteablePromise () { return new Promise<FileSystemWritableFileStream>((fil, rej)=>{
    this.writerReady = fil; 
    this.writerFailed = rej
  })}
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
      this.createWriteable()
    })
    this.writeablePromise = this.newWriteablePromise
  }
  async createWriteable(fileHandle: FileSystemFileHandle = this.fileHandle,
    options: FileSystemCreateWritableOptions = { keepExistingData: true }) {
    let writeable = await fileHandle.createWritable(options)
    let offset = (await fileHandle.getFile()).size
    writeable.seek(offset)
    this.writerReady(writeable)
  }
  async writeLine(text: string) {
    try {
      let line = `${text}\n`
      let stream = (await this.writeablePromise)
      await stream.write({type: 'write', data: line});
      await this.closeFile()       // flush to real-file
      // new Promise for next cycle:
      this.writeablePromise = this.newWriteablePromise
      await this.createWriteable() // re-open in append mode
    } catch (err) {
      console.warn(stime(this, `.writeLine failed:`), err)
      throw err
    }
  }
  async closeFile() {
    try {
      return (await this.writeablePromise).close();
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