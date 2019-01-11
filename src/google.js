/**
 * Google related utils.
 * Depends upon:
 * - https://apis.google.com/js/api.js: auth and picker
 * - https://apis.google.com/js/client.js: drive and request
 */
var dwv = dwv || {};
/** @namespace */
dwv.google = dwv.google || {};
// external
var gapi = gapi || {};
var google = google || {};
dwv.google.selectedFolder = null;

/**
* Google Authentification class.
* Allows to authentificate to google services.
*/
dwv.google.Auth = function () {
  // closure to self
  var self = this;
  // immediate mode: behind the scenes token refresh
  var immediate = false;

  // The Client ID obtained from the Google Developers Console. Replace with your own Client ID.
  this.clientId = "739581003000-7rts1aa1a2he7ifkbaev273r50fvieah.apps.googleusercontent.com";
  // The scope to use to access user's Drive items.
  this.scope = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.metadata https://www.googleapis.com/auth/drive.file';

  /**
  * Load the API and authentify.
  */
  this.load = function () {
    immediate = false;
    gapi.load('client:auth2', self.onApiLoad);
  };

  /**
   * Load the API and authentify silently.
   */
  this.loadSilent = function () {
    immediate = true;
    gapi.load('client:auth2', self.onApiLoad);
  };

  /**
  * Called if the authentification is successful.
  * Default does nothing. No input parameters.
  */
  this.onload = function () { };

  /**
  * Callback to be overloaded.
  * Default does nothing. No input parameters.
  */
  this.onfail = function () { };

  /**
  * Authentificate.
  */
  this.onApiLoad = function () {
    // see https://developers.google.com/api-client-library/...
    //   ...javascript/reference/referencedocs#gapiauthauthorizeparams
    gapi.client.setApiKey("");
    gapi.auth2.authorize({
      'client_id': self.clientId,
      'scope': self.scope,
      'immediate': immediate,
      'response_type': 'id_token permission'
    },
      handleResult
    );
  };

  /**
  * Launch callback if all good.
  * @param {Object} authResult An OAuth 2.0 Token Object.
  * See https://developers.google.com/api-client-library/...
  *   ...javascript/reference/referencedocs#OAuth20TokenObject
  */
  function handleResult(authResult) {
    if (authResult && !authResult.error) {
      self.onload();
    }
    else {
      self.onfail();
    }
  }
};

/**
* Google Picker class.
* Allows to create a picker and handle its result.
*/
dwv.google.Picker = function () {
  // closure to self
  var self = this;

  /**
  * Load API and create picker.
  */
  this.load = function () {
    gapi.load('picker', { 'callback': onApiLoad });
  };

  /**
  * Called after user picked files.
  * @param {Array} ids The list of picked files ids.
  */
  this.onload = null;

  /**
  * Create the picker.
  */
  function onApiLoad() {
    //var view = new google.picker.View(google.picker.ViewId.DOCS);
    //view.setMimeTypes("application/dicom");

    var view = new google.picker.DocsView(); // [MNK]
    view.setIncludeFolders(true);
    view.setMimeTypes('application/vnd.google-apps.folder');
    view.setSelectFolderEnabled(true);

    // see https://developers.google.com/picker/docs/reference#PickerBuilder
    var picker = new google.picker.PickerBuilder()
      .enableFeature(google.picker.Feature.NAV_HIDDEN)
      //.enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(gapi.auth.getToken().access_token)
      .addView(view)
      .setCallback(handleResult)
      .build();
    picker.setVisible(true);
  }

  /**
  * Launch callback if all good.
  * @param {Object} data The data returned by the picker.
  * See https://developers.google.com/picker/docs/results
  */
  function handleResult(data) {
    var folderName = '';
    if (data.action === google.picker.Action.PICKED &&
      data.docs.length !== 0) {
      var ids = [];
      for (var i = 0; i < data.docs.length; ++i) {
        var iter = data.docs[i];
        ids[ids.length] = iter.id;
        folderName = iter.name;
        if (folderName === "Audit") {
          console.log('Auditing');
        }
      }
      self.onload(ids, folderName);
    }
  }
};

/**
* Google Drive class.
* Allows to request google drive for file download links from a list of file ids.
*/
dwv.google.Drive = function () {
  // closure to self
  var self = this;
  // list of ids
  var idList = null;
  var folder = null;

  // The Browser API key obtained from the Google Developers Console.
  this.apiKey = 'AIzaSyCzFQT-l9u1_Q4x-fw3dtDNZigfNivKlvg';

  /**
  * Set the ids to ask for download link.
  * @param {Array} ids The list of file ids to ask for download link.
  */
  this.setIds = function (ids) {
    idList = ids;
  };

  this.setFolder = function (folderName) {
    folder = folderName;
    dwv.google.selectedFolder = folderName;
  }

  this.getFolder = function () {
    return folder;
  }

  /**
  * Get the ids to ask for download link.
  */
  this.getIds = function () {
    return idList;
  };

  /**
  * Load API and query drive for download links.
  * @param {Array} ids The list of file ids to ask for download link.
  */
  this.loadIds = function (ids, folderName = false) {
    self.setIds(ids);
    if (folderName) {
      self.setFolder(folderName);
    }
    self.load();
  };

  /**
  * Load API and query drive for download links.
  * The ids to ask for have been provided via the setIds.
  */
  this.load = function () {
    // set the api key
    gapi.client.setApiKey(self.apiKey);

    var func = createApiLoad(self.getIds());
    gapi.client.load('drive', 'v2', func);
  };

  /**
  * Called after drive response with the file urls.
  * @param {Array} urls The list of files urls corresponding to the input ids.
  */
  this.onload = null;

  /**
  * Create an API load handler.
  * @param {Array} ids The list of file ids to ask for download link.
  */
  function createApiLoad(ids) {
    var f = function () { onApiLoad(ids); };
    return f;
  }

  /**
  * Run the drive request.
  * @param {Array} ids The list of file ids to ask for download link.
  */
  function onApiLoad(ids) {
    // group requests in batch (ans stay bellow quotas)
    var batch = gapi.client.newBatch();
    var reqStates;

    for (var i = 0; i < ids.length; ++i) {
      // Can't make it work, HTTPRequest sends CORS error...
      // see https://developers.google.com/drive/v3/reference/files/get
      //var request = gapi.client.drive.files.get({
      //    'fileId': fileId, 'fields': 'webViewLink'
      //});

      // File path with v2??
      // see https://developers.google.com/api-client-library/...
      //   ...javascript/reference/referencedocs#gapiclientrequestargs
      //var request = gapi.client.request({
      //'path': '/drive/v2/files/' + ids[i],
      //'method': 'GET'
      //});

      var request = gapi.client.drive.files.list({
        q: "'" + ids[i] + "' in parents and mimeType = 'application/dicom'"
      });

      // add to batch
      batch.add(request);

      if (self.getFolder() === 'Audit') {
        reqStates = gapi.client.drive.files.list({
          q: "'" + ids[i] + "' in parents and mimeType = 'application/json'"
        });

        batch.add(reqStates);
      }
    }

    // execute the batch
    batch.execute(handleDriveLoad);
  }

  function fetchFiles(ids) {
    var batch = gapi.client.newBatch();

    for (var i = 0; i < ids.length; ++i) {
      var request = gapi.client.request({
        'path': '/drive/v2/files/' + ids[i],
        'method': 'GET'
      });
      // add to batch
      batch.add(request);
    }
    // execute the batch
    batch.execute(handleFilesLoad);
  }

  function handleFilesLoad(resp) {
    var urlsObj = {};
    var urls = [];
    var respKeys = Object.keys(resp);
    if (self.getFolder() === 'Audit') {
      var sorted = Object.values(resp).sort((a,b) => (a.result.title > b.result.title) ? 1 : ((b.result.title > a.result.title) ? -1 : 0));
      for (var i = 0; i < sorted.length; ++i) {
        var item = sorted[i].result;
        var key = item.title.replace('.json', '')
        if (!urlsObj[key]) {
          urlsObj[key] = {};
        }
        if (item.mimeType === 'application/json') {
          urlsObj[key]['state'] = item.downloadUrl;
        } else {
          urlsObj[key]['url'] = item.downloadUrl;
        }
        
      }
      urls = Object.values(urlsObj);
    } else {
      for (var i = 0; i < respKeys.length; ++i) {
        urls[urls.length] = resp[respKeys[i]].result.downloadUrl;
      }
    }
    
    // call onload
    self.onload(urls);
  }

  /**
  * Launch callback when all queries have returned.
  * @param {Object} resp The batch request response.
  * See https://developers.google.com/api-client-library/...
  *   ...javascript/reference/referencedocs#gapiclientRequestexecute
  */
  function handleDriveLoad(resp) { // TODO [MNK: handle multi page response]
    var ids = [];
    // ID-response map of each requests response
    var respKeys = Object.keys(resp);
    for (var i = 0; i < respKeys.length; ++i) {
      var files = resp[respKeys[i]].result.items;
      for (var f = 0; f < files.length; ++f) {
        ids.push(files[f].id);
      }
    }
    fetchFiles(ids);
  }
};

/**
 * Append authorized header to the input callback arguments.
 * @param {Function} callback The callback to append headers to.
 */
dwv.google.getAuthorizedCallback = function (callback) {
  var func = function (urls) {
    //see https://developers.google.com/api-client-library/javascript/features/cors
    var header = {
      "name": "Authorization",
      "value": "Bearer " + gapi.auth.getToken().access_token
    };
    callback(urls, [header]);
  };
  return func;
};

/**
 * GoogleDriveLoad gui.
 * @constructor
 */
dwv.gui.GoogleDriveLoad = function (app) {
  /**
   * Setup the gdrive load HTML to the page.
   */
  this.setup = function () {
    // behind the scenes authentification to avoid popup blocker
    var gAuth = new dwv.google.Auth();
    gAuth.loadSilent();

    // associated div
    var gdriveLoadDiv = document.createElement("div");
    gdriveLoadDiv.className = "gdrivediv";
    gdriveLoadDiv.style.display = "none";

    // node
    var node = app.getElement("loaderlist");
    // append
    node.appendChild(gdriveLoadDiv);
    // refresh
    dwv.gui.refreshElement(node);
  };

  /**
   * Display the file load HTML.
   * @param {Boolean} bool True to display, false to hide.
   */
  this.display = function (bool) {
    // gdrive div element
    var node = app.getElement("loaderlist");
    var filediv = node.getElementsByClassName("gdrivediv")[0];
    filediv.style.display = bool ? "" : "none";

    if (bool) {
      // jquery mobile dependent
      $("#popupOpen").popup("close");
      app.resetLoadbox();

      var gAuth = new dwv.google.Auth();
      var gPicker = new dwv.google.Picker();
      var gDrive = new dwv.google.Drive();
      // pipeline
      gAuth.onload = gPicker.load;
      gPicker.onload = gDrive.loadIds;
      gDrive.onload = dwv.google.getAuthorizedCallback(app.loadURLs);
      // launch
      gAuth.load();
    }
  };
};

dwv.google.FileOps = function () {

  this.writeProgress = function (id) {
    var appendProgress = {};
    appendProgress[id] = true;
    var progress, existingProgress;

    checkExistingProgress(function ([id, file, existingStat]) {
      var progressFile = "progress.json";
      existingProgress = existingStat;

      if (dwv.google.selectedFolder === "Audit" || dwv.google.selectedFolder === "Test") {
        progressFile = (dwv.google.selectedFolder).toLowerCase() + "-" + progressFile;
      }
      if (existingProgress) {
        progress = Object.assign(JSON.parse(existingProgress), appendProgress);
        var updatedFile = new File([JSON.stringify(progress)], progressFile, {
          type: 'application/json'
        });
        updateFile(id, file, updatedFile, function (params) {
          console.log(params.id);
        });
      } else {
        progress = appendProgress;
        var tempfile = new File([JSON.stringify(progress)], progressFile, {
          type: 'application/json'
        });

        insertFile(tempfile, function (params) {
          console.log(params['id']); // jshint ignore:line
        });
      }
    });
  };

  this.isTaggingCompletedFor = function (fileName, callback) {
    checkExistingProgress(function (doneData) {
      if (doneData) {
        var doneFileNames = JSON.parse(doneData[2]);
        var fileDone = Object.keys(doneFileNames).indexOf(fileName) > -1;
        callback(fileDone);
      } else {
        callback(false);
      }
    });
  };

  function checkExistingProgress(callback) {
    var file, id, content;
    retrieveAllFiles(function (files) {
      if (files && files[0]) {
        id = files[0].id;
        file = files[0];
        var req = gapi.client.drive.files.get({ 'fileId': id });
        req.execute(function (result) {
          downloadFile(result, function (fileContent) {
            content = fileContent;
            callback([id, file, content]);
          });
        });
      } else {
        callback([null, null, null]);
      }
    });
  }

  /**
   * Download a file's content.
   *
   * @param {File} file Drive File instance.
   * @param {Function} callback Function to call when the request is complete.
   */
  function downloadFile(file, callback) {
    if (file.downloadUrl) {
      var accessToken = gapi.auth.getToken().access_token;
      var xhr = new XMLHttpRequest();
      xhr.open('GET', file.downloadUrl);
      xhr.setRequestHeader('Authorization', 'Bearer ' + accessToken);
      xhr.onload = function () {
        callback(xhr.responseText);
      };
      xhr.onerror = function () {
        callback(null);
      };
      xhr.send();
    } else {
      callback(null);
    }
  }

  /**
   * Retrieve a list of File resources.
   *
   * @param {Function} callback Function to call when the request is complete.
   */
  function retrieveAllFiles(callback) {
    var progressFile = "progress.json";
    var retrievePageOfFiles = function (request, result) {
      request.execute(function (resp) {
        result = result.concat(resp.items);
        var nextPageToken = resp.nextPageToken;
        if (nextPageToken) {
          request = gapi.client.drive.files.list({
            'pageToken': nextPageToken
          });
          retrievePageOfFiles(request, result);
        } else {
          callback(result);
        }
      });
    };
    if (dwv.google.selectedFolder === "Audit" || dwv.google.selectedFolder === "Test") {
      progressFile = (dwv.google.selectedFolder).toLowerCase() + "-" + progressFile;
    }
    var initialRequest = gapi.client.drive.files.list({
      q: "title = '" + progressFile + "' and trashed = false"
    });
    retrievePageOfFiles(initialRequest, []);
  }

  /**
   * Insert new file.
   *
   * @param {File} fileData File object to read data from.
   * @param {Function} callback Function to call when the request is complete.
   */
  function insertFile(fileData, callback) {
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    var reader = new FileReader();
    reader.readAsBinaryString(fileData);
    reader.onload = function (e) { // jshint ignore:line
      var contentType = fileData.type || 'application/octet-stream';
      var metadata = {
        'title': fileData.name,
        'mimeType': contentType
      };

      var base64Data = btoa(reader.result);
      var multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: ' + contentType + '\r\n' +
        'Content-Transfer-Encoding: base64\r\n' +
        '\r\n' +
        base64Data +
        close_delim;

      var request = gapi.client.request({
        'path': '/upload/drive/v2/files',
        'method': 'POST',
        'params': { 'uploadType': 'multipart' },
        'headers': {
          'Content-Type': 'multipart/mixed; boundary="' + boundary + '"'
        },
        'body': multipartRequestBody
      });
      if (!callback) {
        callback = function (file) {
          console.log(file);
        };
      }
      request.execute(callback);
    };
  }

  /**
   * Update an existing file's metadata and content.
   *
   * @param {String} fileId ID of the file to update.
   * @param {Object} fileMetadata existing Drive file's metadata.
   * @param {File} fileData File object to read data from.
   * @param {Function} callback Callback function to call when the request is complete.
   */
  function updateFile(fileId, fileMetadata, fileData, callback) {
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    var reader = new FileReader();
    reader.readAsBinaryString(fileData);
    reader.onload = function (e) { // jshint ignore:line
      var contentType = fileData.type || 'application/octet-stream';
      // Updating the metadata is optional and you can instead use the value from drive.files.get.
      var base64Data = btoa(reader.result);
      var multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(fileMetadata) +
        delimiter +
        'Content-Type: ' + contentType + '\r\n' +
        'Content-Transfer-Encoding: base64\r\n' +
        '\r\n' +
        base64Data +
        close_delim;

      var request = gapi.client.request({
        'path': '/upload/drive/v2/files/' + fileId,
        'method': 'PUT',
        'params': { 'uploadType': 'multipart', 'alt': 'json' },
        'headers': {
          'Content-Type': 'multipart/mixed; boundary="' + boundary + '"'
        },
        'body': multipartRequestBody
      });
      if (!callback) {
        callback = function (file) {
          console.log(file);
        };
      }
      request.execute(callback);
    };
  }
};