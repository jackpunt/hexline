class WebWorker {
  // https://www.html5rocks.com/en/tutorials/workers/basics/#toc-inlineworkers
  //
  makeBlobWorker(code: string, onmessage: (ev: MessageEvent<any>) => any) {
    const blob = new Blob([code]);
    // Obtain a blob URL reference to our worker 'file'.
    const blobURL = window.URL.createObjectURL(blob);
    let worker = new Worker(blobURL);
    window.URL.revokeObjectURL(blobURL)
    worker.onmessage = onmessage
    return worker
  }
  example(send: any, pathToImport: string) {
    let code = `
    importScripts('${pathToImport}')
    self.onmessage = function(e) {
      self.postMessage('msg from worker');
    };`;

    addEventListener('message', ({ data }) => {
      const response = `worker response to ${data}`;
      postMessage(response);
    });
    let worker = this.makeBlobWorker(code, (ev) => {
      let data = ev.data
      console.log(data)
    })
    worker.postMessage(send); // Start the worker.
  }
  makeWorkerLocal( ) {
    //new Worker(new URL('./worker.js', import.meta.url));
  }
}