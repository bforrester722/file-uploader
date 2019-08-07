
/**
 * `drag-drop-files`
 * 
 *
 * @customElement
 * @polymer
 * @demo demo/index.html
 */
import {
  SpritefulElement, 
  html
}                 from '@spriteful/spriteful-element/spriteful-element.js';
import htmlString from './drag-drop-files.html';
import '@spriteful/app-icons/app-icons.js';
import '@polymer/iron-icon/iron-icon.js';


class SpritefulDragDropFiles extends SpritefulElement {
  static get is() { return 'drag-drop-files'; }

  static get template() {
    return html([htmlString]);
  }


  static get properties() {
    return {

      accept: {
        type: String,
        value: 'image/*'
      },

      disabled: {
        type: Boolean,
        value: false,
        reflectToAttribute: true
      },

      // when true, the 'disabled-auto-upload-files-added' event is fired
      // and consumer is responsible for calling the addFiles(files) method
      disableAutoUpload: Boolean,

      feedbackText: String,

      hideDroparea: {
        type: Boolean,
        value: false
      },

      items: {
        type: Array,
        value: () => ([]),
        notify: true // bind to upload-list
      },

      label: {
        type: String,
        computed: '__computeLabel(multiple)'
      },

      maxsize: Number,

      maxfiles: Number,

      multiple: {
        type: Boolean,
        value: false
      },

      unit: {
        type: String,
        value: 'Kb'
      },

      _allowedUnits: {
        type: Array, 
        value: ['b', 'kb', 'mb', 'gb']
      },

      _feedbacks: {
        type: Object,
        value: {
          single:   'Sorry but you can only upload one file!',
          tooLarge: 'This file is too large, try a file smaller than {maxsize}{unit}',
          tooMany:  'You can only upload {maxfiles} files'
        }
      }

    };
  }


  static get observers() {
    return [
      '__unitChanged(unit)'
    ];
  }


  connectedCallback() {
    super.connectedCallback();

    this.$.droparea.
      querySelector('input').
      addEventListener('change', e => this.__handleFiles(e.target.files));

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      this.$.droparea.addEventListener(eventName, this.__preventDefaults.bind(this), false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      this.$.droparea.addEventListener(eventName, this.__highlight.bind(this), false)
    });

    ['dragleave', 'drop'].forEach(eventName => {
      this.$.droparea.addEventListener(eventName, this.__unhighlight.bind(this), false)
    });

    this.$.droparea.addEventListener('drop', this.__handleDrop.bind(this), false);
  }

  
  __computeLabel(multiple) {
    return multiple ? 'Drop files here or click' : 'Drop file here or click';
  }


  __unitChanged(unit) {
    const unitLowerCase = unit.toLowerCase();
    if (this._allowedUnits.indexOf(unitLowerCase) == -1) {
      throw new Error(`The unit ${unitLowerCase} is not known`);
    }  
  }


  __preventDefaults(event) {
    event.preventDefault();
    event.stopPropagation();
  }


  __highlight() {
    this.$.droparea.classList.add('highlight')
  }


  __unhighlight() {
    this.$.droparea.classList.remove('highlight')
  }


  __hideDroparea() {
    this.$.droparea.classList.add('hidden');
  }


  __unhideDroparea() {
    this.$.droparea.classList.remove('hidden');
  }


  __handleDrop(event) {
    const {files} = event.dataTransfer;
    this.__handleFiles(files);
  }


  __handleFiles(files) {
    const filesArray = [...files]; // true array
    if (this.disableAutoUpload) {
      this.fire('disabled-auto-upload-files-added', {files: filesArray});
    }
    else {
      this.addFiles(filesArray);
    }
  }


  __handleMultipleFiles(files) {
    if (this.maxfiles && this.items.length + files.length > this.maxfiles) {
      this.__tooManyFeedback();
    }
    else if (files.some(file => this.maxsize && files[0].size > this.getMaxsize())) {
      this.__tooLargeFeedback();
    }
    else {
      this.__clearFeedback();
      files.forEach(file => this.push('items', {file}));
      this.fire('file-added', {files: files});
      this.fire('change',     {files: this.getFiles()});
      if (this.items.length + files.length === this.maxfiles && this.hideDroparea) {
        this.__hideDroparea();
      }
    }
  }


  __handleSingleFile(file) {
    if (this.maxsize && file.size > this.getMaxsize()) {
      this.__tooLargeFeedback();
    }
    else {
      this.__clearFeedback();
      this.push('items', {file});
      if (this.hideDroparea) {
        this.__hideDroparea();
      }
      this.fire('file-added', {files: [file]});
      this.fire('change',     {files: this.getFiles()});
    }
  }


  // __handleSingleFile(file) {
  //   if (this.maxsize && file.size > this.getMaxsize()) {
  //     this.__tooLargeFeedback();
  //   }
  //   else {
  //     this.__clearFeedback();
  //     if (this.items.length === 0) {
  //       this.push('items', {file});
  //       this.fire('file-added', {files: [file]});
  //       if (this.hideDroparea) {
  //         this.__hideDroparea();
  //       }
  //     }
  //     else {
  //       this.push('items', {file});
  //       // this.set('items.0', {file});
  //     }

  //     this.fire('change', {files: this.getFiles()});
  //   }
  // }


  __clearFeedback()  {
    this.feedbackText = '';
  }


  __createFeedback(id) {
    let text = this._feedbacks[id];
    text = text.replace(/\{maxsize\}/, this.maxsize);
    text = text.replace(/\{maxfiles\}/, this.getMaxsize());
    text = text.replace(/\{accept\}/, this.accept);
    text = text.replace(/\{label\}/, this.label);
    text = text.replace(/\{multiple\}/, this.multiple);
    text = text.replace(/\{unit\}/, this.unit);
    this.feedbackText = text;
  }


  __singleFeedback() {
    this.__createFeedback('single');
  }


  __tooLargeFeedback() {
    this.__createFeedback('tooLarge');
  }


  __tooManyFeedback() {
    this.__createFeedback('tooMany');
  }


  __hideItemAndGCFile(index) {
    const item = this.items[index];
    item.file  = undefined;
    this.fire('hide-upload-item', {index});
  }

  // private helper function
  __deleteFile(index) {
    this.__hideItemAndGCFile(index);
    this.fire('change', {files: this.getFiles()});
    this.__unhideDroparea();
    if (this.items.length === 0) {
      this.__clearFeedback();
    }
  }

  // private and public api depending on this.disableAutoUpload state
  addFiles(files) {
    if (this.multiple) {
      this.__handleMultipleFiles(files);
    }
    else if (files.length === 1) {
      this.__handleSingleFile(files[0]);
    }
    else {
      this.__singleFeedback();
    }
  }


  getMaxsize() {
    const index = this._allowedUnits.indexOf(this.unit.toLowerCase());
    return this.maxsize * index * 1024;
  }


  setFeedback(id, text) {
    this._feedbacks[id] = text;
  }


  itemClicked() {
    if (this.multiple || !this.hideDroparea) { return; }
    this.$.input.click();
  }


  getFiles() {
    return this.items.
      map(item => item.file).
      filter(file => file);
  }


  getFileByName(name) {
    return this.items.find(item => item.name === name);
  }

  // upload-list -> file-item ui x button clicked
  removeFileByIndex(index) {
    const item            = this.items[index];
    const {newName: name} = item.file;
    this.fire('file-removed', {name});
    this.fire('change', {files: this.getFiles()});
    this.__unhideDroparea();
    this.__hideItemAndGCFile(index);
  }

  // public api
  removeFile(file) {
    const index = this.items.findIndex(obj => obj.file === file);
    if (index === -1) {
      console.warn('cannot find file to remove in file list');
      return; 
    }
    this.__deleteFile(index);
  }


  reset() {
    this.fire('reset-upload-list');
    this.splice('items', 0);
    this.fire('change', {files: []});
    this.__unhideDroparea();
    this.__clearFeedback();
  }


  uploadComplete(obj) {
    this.__deleteFile(obj.index);
    this.fire('file-saved', obj);
  }

}

window.customElements.define(SpritefulDragDropFiles.is, SpritefulDragDropFiles);
