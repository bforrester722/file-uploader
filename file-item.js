
/**
 * `file-item`
 * 
 *
 * @customElement
 * @polymer
 * @demo demo/index.html
 */
import {
  SpritefulElement, 
  html
}                             from '@spriteful/spriteful-element/spriteful-element.js';
import {warn}                 from '@spriteful/utils/utils.js';
import htmlString             from './file-item.html';
import services, {proxyValue} from '@spriteful/services/services.js';
import '@spriteful/app-icons/app-icons.js';
import '@polymer/paper-icon-button/paper-icon-button.js';
import '@polymer/paper-progress/paper-progress.js';


class SpritefulDragDropFileItem extends SpritefulElement {
  static get is() { return 'file-item'; }

  static get template() {
    return html([htmlString]);
  }


  static get properties() {
    return {
      // firebase storage file directory/path
      directory: String,

      file: Object,
      // template index
      index: Number,
      // file metadata that is saved along with file
      metadata: Object,
      // file upload controls
      // {cancel, pause, resume}
      _controls: Object,
      // error from file upload
      _error: Object,
      // hides pause/play button when upload is done or canceled
      _hideControlBtns: Boolean,
      // upload progress
      _progress: Number,

      _paused: {
        type: Boolean,
        value: false
      },
      // upload state
      _state: String,

    };
  }


  connectedCallback() {
    super.connectedCallback();

    this.__uploadFile(this.file, this.metadata);
  }


  __uploadFinished(data) {
    const {url, name: filename, path} = data;
    const name            = filename.split('.')[0];
    this._state           = 'done';
    this._hideControlBtns = true;
    this.fire('upload-complete', { 
      filename, 
      name,
      original: url,
      path
    });
  }


  __uploadFile(file, metadata) {
    if (!this.directory) { 
      throw new Error('drag-drop-files must have the directory property set'); 
    }
    const dir  = this.directory;
    const name = file.newName ? file.newName : file.name.split('.')[0];

    const controlsCallback = controls => {
      // controls === {cancel, pause, resume}
      this._controls = controls;
    };

    const doneCallback = data => {
      this.__uploadFinished(data);
    };

    const errorCallback = error => {
      if (error.code_ && error.code_ === 'storage/canceled') {
        this._hideControlBtns = true;
        this._state           = 'canceled';
        return;
      }

      if (error.code_ && error.code_ === 'storage/unknown') {
        this._hideControlBtns = true;
        this._state           = 'errored';
        warn('Sorry, an error occured while uploading your file.');
        return;
      }

      // TODO:
      //      show error feedback ui


      this._error = error;

      console.log('upload error: ', error.code_);

      // console.error(error);


    };

    const stateChangedCallback = data => {
      const {progress, state} = data;
      this._progress = progress;
      this._state    = state
    };

    services.fileUpload({
      controlsCallback:     proxyValue(controlsCallback),
      dir, 
      doneCallback:         proxyValue(doneCallback),
      errorCallback:        proxyValue(errorCallback), 
      file,
      metadata, 
      name, 
      stateChangedCallback: proxyValue(stateChangedCallback)
    });    
  }

  // file ui x button clicked
  async __removeFileButtonClicked() {
    try {
      await this.clicked();
      this.cancelUpload();
      this.fire('remove-file', {index: this.index});
    }
    catch (error) { 
      if (error === 'click debounced') { return; }
      console.error(error); 
    }
  }


  async __pauseUploadButtonClicked() {
    if (!this._controls) { return; }
    try {
      await this.clicked();
      this._paused = true;
      this._controls.pause();
    }
    catch (error) {
      if (error === 'click debounced') { return; }
      console.error(error);
    }   
  }


  async __resumeUploadButtonClicked() {
    if (!this._controls) { return; }
    try {
      await this.clicked();
      this._paused = false;
      this._controls.resume();
    }
    catch (error) {
      if (error === 'click debounced') { return; }
      console.error(error);
    }   
  }


  cancelUpload() {
    this._controls.cancel();
  }

}

window.customElements.define(SpritefulDragDropFileItem.is, SpritefulDragDropFileItem);
