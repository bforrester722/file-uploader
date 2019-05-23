/**
 * `file-uploader`
 * 
 *  Accepts files from user and handles uploading/optimization/deleting/previewing/rearranging
 *
 *
 *  properites:
 *
 *    accept - <String> optional: file type to allow from user. 
 *             ie. 'audio', 'video', 'audio,.jpg', '.doc', ... 
 *             default -> 'image'
 *
 *
 *    coll - <String> required: firestore collection path to use when saving
 *           ie. `cms/ui/programs`, 'images', `users`
 *           default -> undefined
 *
 *
 *    doc - <String> required: firestore document path to use when saving
 *           ie. `${program}`, 'home', `${uid}`
 *           default -> undefined
 *
 *
 *    field - <String> optional: firestore document object field (prop) to save the file metadata/info
 *            ie. 'backgroundImg', 'carousel', 'profileImg'
 *            default -> 'images'
 *
 *
 *    multiple - <Boolean> optional: false -> only accept one file at a time, true -> allow many files at the same time
 *               default -> false
 *
 *
 *
 *  events:
 *
 *    'file-received' - fired when user starts a file upload process
 *                      detail -> {tempUrl, coll, doc, name, ext, type, size, path, field, index}
 *                                 tempUrl - present for images only - window.URL.createObjectURL
 *                                 index   - used for multiple files ordering
 *
 *  
 *    'file-uploaded' - fired after successful upload operation
 *                      detail -> {url, coll, doc, name, ext, type, size, path, field, index}
 *                                 index - used for multiple files ordering
 *                                 url   - public download url for full size original
 *
 *
 *    'file-optimized' - image files only - fired after optimization cloud function has finished processing image
 *                       detail -> {optimized, thumbnail, url, coll, doc, name, ext, type, size, path, field, index}
 *                                 optimized - public download url for processed and resized file (1024px max width)
 *                                 thumbnail - public download url for processed and resized file (256px wide)
 *                                 url       - public download url for full size original
 *
 *
 *    'file-deleted' - fired after user deletes a file
 *                     detail -> {url, coll, doc, name, ext, type, size, path, field, index <, optimized, thumbnail>}
 *
 *     
 *    'upload-cancelled' - fired if user cancels the upload process
 *                         detail -> {url, coll, doc, name, ext, type, size, path, field, index <, optimized, thumbnail>}          
 *
 *
 *  
 *  methods:
 *
 *    fetch() - returns Promise 
 *              resolves to single obj if multiple is false {url, name, ext, type, size, path, field, index <, optimized, thumbnail>}
 *              resolves to a collection if multiple is true
 *
 *    delete(name) - name  -> <String> required: file name to target for delete operation
 *                            returns Promise 
 *                            resolves to {url, name, ext, type, size, path, field, index <, optimized, thumbnail>}
 *
 *    
 *    deleteAll() - returns Promise 
 *                  resolves to [{url, name, ext, type, size, path, field, index <, optimized, thumbnail>}, ...]
 *
 *
 *    slots:
 *
 *      layout - occupies area above delete zone
 *               default -> drag-drop-list
 *      preview - placed under file dropzone
 *                default -> empty
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
  if (y < top  || y > bottom) { return false; }
  if (x < left || x > right)  { return false; }
  return true;
};


const getFileName = filename => filename.split('.')[0];


const formatFileSize = size => {
  if (size < 1024) {
    return `${size}bytes`;
  } 
  else if (size >= 1024 && size < 1048576) {
    return `${(size / 1024).toFixed(1)}KB`;
  } 
  else if (size >= 1048576) {
    return `${(size / 1048576).toFixed(1)}MB`;
  }
};


class FileUploader extends SpritefulElement {
  static get is() { return 'file-uploader'; }

  static get template() {
    return html([htmlString]);
  }


  static get properties() {
    return {

      accept: {
        type: String,
        value: 'image'
      },

      coll: String,

      doc: String,

      field: {
        type: String,
        value: 'images'
      },
      // one file upload or multiple files
      multiple: {
        type: Boolean,
        value: false
      },

      _directory: {
        type: String,
        computed: '__computeDirectory(coll, doc)'
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
      // used to delete the previous image from storage
      // when multiple is not truthy
      _previousItems: {
        type: Array,
        value: () => ([])
      },

      _targetToDelete: Object

    };
  }


  __computeFileAccept(accept) {
    if (!accept || accept === 'image') { return 'image/*'; }
    if (accept === 'audio') { return 'audio/*'; } 
    if (accept === 'video') { return 'video/*'; }
    return accept;
  }


  __computeDirectory(coll, doc) {
    if (!coll || !doc) { return; }
    return `${coll}/${doc}`;
  }


  __computeListClass(multiple) {
    return multiple ? '' : 'center-list';
  }


  __computeThumbnailSrc(item) {
    if (!item) { return '#'; }
    const {tempUrl, url} = item;
    return url ? url : tempUrl;
  }


  __computeFileNamePlaceholder(fileName) {
    return fileName.split('.')[0];
  }


  __computeRenameModalHeading(multiple) {
    return multiple ? 'Rename Files' : 'Rename File';
  }


  __computeRenameModalPural(multiple) {
    return multiple ? 'these files' : 'this file';
  }


  __computeRenameModalText(multiple) {
    return multiple ? 'File names MUST be unique.' : 'The name MUST be unique.';
  }


  async __fetchItemsFromDb() {
    try {
      const data = await services.get({coll: this.coll, doc: this.doc});
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
          file.newName = getFileName(file.name);
        }
        return file;
      });
      this.__addNewItems(renamedFiles);
      this.$.fileDropZone.addFiles(renamedFiles);
      await schedule();       
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
        file.newName = getFileName(file.name);
        return file;
      });
      this.__addNewItems(files);
      this.$.fileDropZone.addFiles(files);
      await schedule();       
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
      coll:   this.coll, 
      doc:    this.doc, 
      field: `${this.field}.${name}`
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
      await this.$.spinner.show('Deleting item data...');      
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
        await this.$.spinner.show('Deleting file...');
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


  async init() {
    if (!this.doc) { return; }
    if (this._items.length) { return; }
    await this.$.spinner.show('Loading data...');
    // this.$.container.style.opacity = '1';
    await this.__fetchItemsFromDb();
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
        await this.$.spinner.show('Deleting file...');
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


  __invalidPropError(str) {
    throw new Error(`file-uploader must have a valid ${str} property set`);
  }


  async fetch() {
    if (!this.coll) {
      this.__invalidPropError('coll');
    }
    if (!this.doc) {
      this.__invalidPropError('doc');
    }
    if (!this.field) {
      this.__invalidPropError('field');
    }

    return this.reset();
  }


  async delete(name) {

  }


  async deleteAll() {

  }

}

window.customElements.define(FileUploader.is, FileUploader);
