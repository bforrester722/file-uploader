
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
import '@spriteful/cms-icons/cms-icons.js';
import '@polymer/iron-icon/iron-icon.js';
import './file-item.js';


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
      // the firebase storage file directory ie. 'images/home_carousel'
      directory: String,
      // when true, the 'disabled-auto-upload-files-added' event is fired
      // and consumer is responsible for calling the addFiles(files) method
      disableAutoUpload: Boolean,

      feedbackText: String,
      // firestore document field to use for saving file data after processing
      // ie. 'backgroundImg', 'catImages', ...
      field: {
        type: String,
        value: 'images'
      },

      hideDroparea: {
        type: Boolean,
        value: false
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
      },

      _items: {
        type: Array,
        value: () => ([])
      },

      _metadata: {
        type: Object,
        computed: '__computeMetadata(field)'
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


  __computeMetadata(field) {
    // metadata.customMetadata in client sdk, metadata.metadata in cloud functions
    return {customMetadata: {field}}; 
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
    this.$.listbox.classList.add('single');
    this.$.droparea.classList.add('hidden');
  }


  __unhideDroparea() {
    this.$.listbox.classList.remove('single');
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
    if (this.maxfiles && this._items.length + files.length > this.maxfiles) {
      this.__tooManyFeedback();
    }
    else if (files.some(file => this.maxsize && files[0].size > this.getMaxsize())) {
      this.__tooLargeFeedback();
    }
    else {
      this.__clearFeedback();
      files.forEach(file => this.push('_items', {file}));
      this.fire('file-added', {files: files});
      this.fire('change',     {files: this.getFiles()});
      if (this._items.length + files.length === this.maxfiles && this.hideDroparea) {
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
      this.push('_items', {file});
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
  //     if (this._items.length === 0) {
  //       this.push('_items', {file});
  //       this.fire('file-added', {files: [file]});
  //       if (this.hideDroparea) {
  //         this.__hideDroparea();
  //       }
  //     }
  //     else {
  //       this.push('_items', {file});
  //       // this.set('_items.0', {file});
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
    const item    = this._items[index];
    const element = this.selectAll('.item')[index];
    element.cancelUpload();
    element.classList.remove('displayed');
    item.file = undefined;
  }


  // file-item ui x button clicked
  __removeFile(event) {
    this.__preventDefaults(event);
    const {index}         = event.detail;
    const item            = this._items[index];
    const {newName: name} = item.file;
    this.fire('file-removed', {name});
    this.fire('change', {files: this.getFiles()});
    this.__unhideDroparea();
    this.__hideItemAndGCFile(index);
  }


  async __fileItemClicked() {
    if (this.multiple || !this.hideDroparea) { return; }
    try {
      await this.clicked();
      this.$.input.click();
    }
    catch (error) { 
      if (error === 'click debounced') { return; }
      console.error(error); 
    }
  }

  // private helper function
  __deleteFile(index) {
    this.__hideItemAndGCFile(index);
    this.fire('change', {files: this.getFiles()});
    this.__unhideDroparea();
    if (this._items.length === 0) {
      this.__clearFeedback();
    }
  }


  // __itemAnimationEnd(event) {
  //   if (typeof this._indexToDelete !== 'number') { return; }
  //   this.__deleteFile(this._indexToDelete);
  //   this._indexToDelete = undefined;
  // }


  // __fileUploadComplete(event) {
  //   const {index}        = event.detail;
  //   const items          = this.selectAll('.item');
  //   const remainingItems = items.slice(index + 1);

  //   if (remainingItems.length) {
  //     this._indexToDelete = index;
  //     remainingItems.forEach(item => {
  //       item.classList.add('slide-up');
  //     });
  //   } else {
  //     this.__deleteFile(index);
  //   }
  // }

  // TODO:
  //      animate the remaining items up before delete
  //      take care to make sure items to delete are queued properly
  //      since they may finish uploading before animation is finished


  // event handler from file-item
  __fileUploadComplete(event) {
    const {name} = event.detail;
    const index  = this._items.findIndex(obj => {
      if (!obj.file) { return false; }
      return obj.file.newName === name;
    });
    this.__deleteFile(index);
    this.fire('file-saved', event.detail);
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


  getFiles() {
    return this._items.
      map(item => item.file).
      filter(file => file);
  }


  getFileByName(name) {
    return this._items.find(item => item.name === name);
  }

  // public api
  removeFile(file) {
    const index = this._items.findIndex(obj => obj.file === file);
    if (index === -1) {
      console.warn('cannot find file to remove in file list');
      return; 
    }
    this.__deleteFile(index);
  }


  reset() {
    const elements = this.selectAll('.item');
    elements.forEach(element => {
      element.cancelUpload();
    });
    this.splice('_items', 0);
    this.fire('change', {files: []});
    this.__unhideDroparea();
    this.__clearFeedback();
  }

}

window.customElements.define(SpritefulDragDropFiles.is, SpritefulDragDropFiles);
