// Where conversations are kept. In a browser they live in this laptop's recordit library (db-server.js), so
// every browser sees the same ones. The installed phone app has no laptop engine, so it keeps them on the
// device (db-browser.js), as before.
import * as onDevice from './db-browser.js';
import * as onLaptop from './db-server.js';
import {noLaptop} from './mobile.js';

const store=noLaptop?onDevice:onLaptop;
export const {list,save,editAnswers,saveSummary,getAudio,saveAudio,remove,markBacked,attachAudio,forkBackup,refileCollections,fileBatch,snapshotLibrary,restoreLibrary,syncAdd,syncUpdate}=store;
// Sending only each new piece of a recording; the on-device store saves the whole recording instead.
export const appendAudio=store.appendAudio||(async()=>false);
