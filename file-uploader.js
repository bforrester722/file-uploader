/**
 * `file-uploader`
 * 
 *
 *  properites:
 *
 *    
 *
 *
 *  methods:
 *
 *    
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
import {
  compose, 
  join, 
  map, 
  split
}                 from '@spriteful/lambda/lambda.js';
import {
  isDisplayed, 
  listen, 
  message, 
  schedule
}                 from '@spriteful/utils/utils.js';
import htmlString from './file-uploader.html';
import services   from '@spriteful/services/services.js';
import '@spriteful/app-icons/app-icons.js';
import '@spriteful/app-modal/app-modal.js';
import '@spriteful/app-spinner/app-spinner.js';
import '@spriteful/drag-drop-list/drag-drop-list.js';
import '@spriteful/drag-drop-files/drag-drop-files.js';
import '@polymer/iron-image/iron-image.js';
import '@polymer/paper-button/paper-button.js';
import '@polymer/paper-input/paper-input.js';


const trim                = str => str.trim();
const toLower             = str => str.toLowerCase();
const removeSpacesAndCaps = compose(trim, split(' '), map(toLower), join(''));

const dropIsOverDeleteArea = ({top, right, bottom, left, x, y}) => {
  if (y < top || y > bottom) { return false; }
  if (x < left || x > right) { return false; }
  return true;
};


const getNewFileName = filename => filename.split('.')[0];


class FileUploader extends SpritefulElement {
  static get is() { return 'file-uploader'; }

  static get template() {
    return html([htmlString]);
  }


  static get properties() {
    return {

      kind: {
        type: String,
        value: 'ui'
      },

      noSaveButton: {
        type: Boolean,
        value: false
      },
      // name to save files for client app to reference 
      // ie. 'home', 'shop', 'events', etc.
      target: String,
      // used to set the path that the data is saved under
      // so the client can refer to it
      // also sets _mulitple for file selection (false for an image, true for carousel)
      // ie. 'images', 'events', or 'carousels'
      type: String,
      // one file upload or multiple files
      multiple: {
        type: Boolean,
        value: false
      },
      // firebase collection
      _coll: {
        type: String,
        readOnly: true,
        computed: '__computeColl(kind, type)'
      },

      _directory: {
        type: String,
        computed: '__computeDirectory(_coll, _doc)'
      },

      _doc: {
        type: String,
        computed: '__computeDoc(target)'
      },

      _filesToRename: Array,

      _items: {
        type: Array,
        value: () => ([])
      },

      _itemToDelete: Object,

      _itemsUploadData: {
        type: Object,
        value: () => ({})
      },

      _newFileNames: {
        type: Object,
        value: () => ({})
      },

      _publishChangesBtnDisabled: {
        type: Boolean,
        value: true
      },
      // used to delete the previous image from storage
      // when multiple is not truthy
      _previousItems: {
        type: Array,
        value: () => ([])
      },

      _targetToDelete: Object


    };
  }


  static get observers() {
    return [
      '__publishChangesBtnDisabledChanged(_publishChangesBtnDisabled)'
    ];
  }


  __computePublishBtnClass(bool) {
    return bool ? 'no-save-button' : '';
  }


  __computeListClass(multiple) {
    return multiple ? '' : 'center-list';
  }


  __computeColl(kind, type) {
    return `cms/${kind}/${type}`;
  }


  __computeDoc(target) {
    if (!target) { return ''; }
    return removeSpacesAndCaps(target);
  }


  __computeDirectory(coll, doc) {
    if (!coll || !doc) { return; }
    return `${coll}/${doc}`;
  }


  __computeThumbnailSrc(item) {
    if (!item) { return '#'; }
    const {tempUrl, url} = item;
    return url ? url : tempUrl;
  }


  __computeFileNamePlaceholder(fileName) {
    return fileName.split('.')[0];
  }


  __publishChangesBtnDisabledChanged(disabled) {
    this.fire('file-uploader-changes-ready', {ready: !disabled});
  }


  async __fetchItemsFromDb() {
    try {
      const data = await services.get({coll: this._coll, doc: this._doc});
      if (!data) { 
        this._items = [];
        return;
      }
      const images = data.images ? data.images : data;
      const keys   = Object.keys(images);
      this._items  = keys.
        reduce((accum, key) => {
          const image   = images[key];
          const {index} = image;
          if (typeof index === 'number') {
            accum[index] = image;
          }
          else {
            accum = [...accum, image];
          }
          return accum;
        }, []).
        filter(obj => obj);
    }
    catch (error) {
      if (error.message) {
        const text = error.message.split('!')[0];
        if (text === 'Error: No such document') { return; } // ignore new instances
      }
      this.$.spinner.hide();
      console.error(error);
    }
  }


  __checkPublishChangesBtnState() {
    const files                     = this.$.fileDropZone.getFiles();
    this._publishChangesBtnDisabled = undefined;
    this._publishChangesBtnDisabled = Boolean(files.length);
  }


  __handleFileSaved(event) {
    const {filename, name, path, url} = event.detail;
    // rename url to tempUrl so as not to overwrite 
    // the url that is saved after image is processed in the cloud
    this._itemsUploadData[name] = {
      filename, 
      name, 
      path, 
      tempUrl: url 
    };
    this.__checkPublishChangesBtnState(); 
  }


  __handleImageLoadedChanged(event) {
    const {detail, model} = event;
    const {value: loaded} = detail;
    if (loaded) {
      window.URL.revokeObjectURL(model.item.url);
    }
  }


  __renameInputChanged(event) {
    const {value}            = event.detail;
    const {name}             = event.model.item;
    this._newFileNames[name] = value;
  }


  __addNewItems(files) {
    const newItems = files.map(file => ({
      name:    file.newName,
      tempUrl: file.tempUrl
    }));
    if (!this.multiple) {
      // store previous images so they may be cleaned up
      // from storage and db
      const previous = this._items[this._items.length - 1];
      this._previousItems.push(previous);
      this._items = newItems;
    }
    else {
      this.push('_items', ...newItems);
    }
  }


  async __saveFileNamesButtonClicked() {
    try {
      await this.clicked();
      const renamedFiles = this._filesToRename.map(file => {
        if (this._newFileNames[file.name]) {
          file.newName = this._newFileNames[file.name];
        }
        else {
          file.newName = getNewFileName(file.name);
        }
        return file;
      });
      this.__addNewItems(renamedFiles);
      this.$.fileDropZone.addFiles(renamedFiles);
      await schedule();
      this.__checkPublishChangesBtnState(); 
      await this.$.renameFilesModal.close();
      this._filesToRename = undefined;
      this._newFileNames  = {};
    }
    catch (error) {
      if (error === 'click debounced') { return; }
      console.error(error);
    }
  }


  async __dismissRenameFilesModalButtonClicked() {
    try {
      await this.clicked();
      const files = this._filesToRename.map(file => {
        file.newName = getNewFileName(file.name);
        return file;
      });
      this.__addNewItems(files);
      this.$.fileDropZone.addFiles(files);
      await schedule();
      this.__checkPublishChangesBtnState(); 
      await this.$.renameFilesModal.close();
      this._filesToRename = undefined;
      this._newFileNames  = {};
    }
    catch (error) {
      if (error === 'click debounced') { return; }
      console.error(error);
    }
  }


  async __handleFilesAdded(event) {
    const {files}       = event.detail;
    this._filesToRename = files.map(file => {
      file.tempUrl = window.URL.createObjectURL(file);
      return file;
    });
    await schedule();
    this.$.renameFilesModal.open();
  }


  __deleteImageFromDb(name) {
    return services.deleteField({
      coll:   this._coll, 
      doc:    this._doc, 
      field: `images.${name}`
    });
  }

  // fake deleting the element to play nicely with spriteful-drag-drop-list
  __hideSortableElement(name) {
    const elements = this.selectAll('.sortable');
    const element  = elements.find(element => 
      element.item.name === name);
    if (!element) { return; }
    element.classList.remove('sortable');
    element.style.display = 'none';
    return element;
  }

  // from file upload progress 'X' button
  async __handleFileRemoved(event) {
    try {
      await this.$.spinner.show(`Deleting ${this.type} item data...`);      
      const {name}  = event.detail;
      const element = this.__hideSortableElement(name);
      if (!element) { return; }
      const previousPath = element.item.path;
      const recentPath   = this._itemsUploadData[name] ? 
                             this._itemsUploadData[name].path : 
                             undefined;     
      delete this._itemsUploadData[name];

      if (previousPath) {
        await services.deleteFile(previousPath);
      }
      if (recentPath) {
        await services.deleteFile(recentPath);
      }
      await this.__deleteImageFromDb(name);
    }
    catch (error) {
      console.error(error);
    }
    finally {
      this.$.spinner.hide();
    }
  }


  __handleSortFinished() {
    if (this._itemToDelete) {
      this._targetToDelete.style.opacity = '0';
    }
    this.__checkPublishChangesBtnState(); 
  }


  __getDeletePath(name, path) {
    if (path) {
      return path;
    }
    if (this._itemsUploadData[name]) {
      return this._itemsUploadData[name].path;
    }
  }

  // drag-drop delete area modal
  async __confirmDeleteButtonClicked() {
    try {
      await this.clicked();
      const files        = this.$.fileDropZone.getFiles();
      const fileToDelete = files.find(file => 
        file.newName === this._itemToDelete.name);
      if (fileToDelete) { // cancel upload and remove file from dropzone list
        this.$.fileDropZone.removeFile(fileToDelete);
      }
      const {name, path} = this._itemToDelete;
      const deletePath   = this.__getDeletePath(name, path);
      if (deletePath) {
        await this.$.spinner.show(`Deleting ${this.type} file...`);
        delete this._itemsUploadData[name];
        await this.__deleteImageFromDb(name);
        await services.deleteFile(deletePath);
      }
    }
    catch (error) {
      if (error === 'click disabled') { return; }
      console.error(error);
    }
    finally {
      this.__hideSortableElement(this._itemToDelete.name);
      this._targetToDelete.style.opacity = '1';
      await this.$.deleteConfirmModal.close();
      this._targetToDelete = undefined;
      this._itemToDelete   = undefined;
      this.$.spinner.hide();
    }
  }


  async __dismissDeleteConfirmButtonClicked() {
    try {
      await this.clicked();
      this._targetToDelete.style.opacity = '1';
      this._itemToDelete                 = undefined;
      this.$.deleteConfirmModal.close();
    }
    catch (error) {
      if (error === 'click debounced') { return; }
      console.error(error);
    }
  }
  // see if item was dropped over the delete area
  // compare pointer coordinates with area position
  async __handleDeleteDrop(event) {
    const {data, target}             = event.detail;
    const {x, y}                     = data;
    const {top, right, bottom, left} = this.$.deleteArea.getBoundingClientRect();
    const measurements               = {top, right, bottom, left, x, y};

    if (dropIsOverDeleteArea(measurements)) {
      // show a confirmation modal before deleting
      const {item}           = target;
      const {height, width}  = target.getBoundingClientRect();
      const xCenter          = x - (width / 2);
      const yCenter          = y - (height / 2);
      // override transform to keep item over delete zone
      target.style.transform = `translate3d(${xCenter}px, ${yCenter}px, 1px)`;
      this._targetToDelete   = target;
      this._itemToDelete     = item;
      await schedule();
      this.$.deleteConfirmModal.open();
    }
  }

  // ignore errors since the item may already have been deleted
  async __safeDeleteFile(path) {
    try {
      await services.deleteFile(path);
    }
    catch (error) {
      console.warn('__safeDeleteFile maybe already deleted: ', path, ' error: ', error);
    }
    finally {
      return path;
    }
  }

  // ignore errors since the item may already have been deleted
  async __safeDeleteImgFromDb(name) {
    try {
      await this.__deleteImageFromDb(name);
    }
    catch (error) {
      console.warn('__safeDeleteImgFromDb maybe already deleted: ', name, ' error: ', error);
    }
    finally {
      return name;
    }
  }


  __cleanupOldUploads() {
    if (this.multiple) { return; }
    if (!this._previousItems.length) { return; }
    const noNewItems = this._previousItems.filter(item => 
      item && item.path);
    const filePromises = noNewItems.map(item => 
      this.__safeDeleteFile(item.path));
    const fieldPromises = noNewItems.map(item => 
      this.__safeDeleteImgFromDb(item.name));
    return Promise.all([...filePromises, ...fieldPromises]);
  }


  async __publishChangesButtonClicked() {
    try {
      await this.clicked();
      await this.$.spinner.show('Saving changes...');
      const images = this.getImages();
      await services.set({
        coll:  this._coll, 
        doc:   this._doc, 
        data:  {images}, 
        merge: true // race with db processing uploaded img
      });
      await this.reset();
      message('Your changes are now live!');      
    }
    catch (error) { 
      if (error === 'click debounced') { return; }
      console.error(error); 
    }
    finally {
      this.$.spinner.hide();
    }
  }


  async init() {
    if (!this._doc || !this.type) { return; }
    if (this._items.length) { return; }
    await this.$.spinner.show(`Loading ${this.type} data...`);
    this.$.container.style.opacity = '1';
    await this.__fetchItemsFromDb();
    this._publishChangesBtnDisabled = true;
    return this.$.spinner.hide();
  }


  getImages() {
    // build an array with upload data and the resorted index
    // based on how they show up in the drag and drop list
    const repeaterElements = this.selectAll('.sortable').
                               filter(el => isDisplayed(el));
    // cannot create an array, must be object for deleting by name
    const images = repeaterElements.reduce((accum, element, index) => {
      const {name} = element.item;
      accum[name]  = Object.assign(
        {capture: false, orientation: 0}, 
        element.item, 
        this._itemsUploadData[name],
        {index}
      );
      return accum;
    }, {});

    return images;
  }


  async deleteImage(name, path) {
    try {
      const deletePath = this.__getDeletePath(name, path);
      if (deletePath) {
        await this.$.spinner.show(`Deleting ${this.type} file...`);
        delete this._itemsUploadData[name];
        await services.deleteFile(deletePath);        
      }
    }
    catch (error) {
      console.error(error);
    }
    finally {
      return this.$.spinner.hide();
    }
  }


  async reset() { 
    await this.__cleanupOldUploads();
    this.$.fileDropZone.reset();
    this._items         = [];
    this._previousItems = [];
    return this.init();
  }

}

window.customElements.define(FileUploader.is, FileUploader);
