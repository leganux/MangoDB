class MangoDB {
  constructor(storageType = 'localStorage') {
    this.storageType = storageType;
    this.collections = {};
  }

  collection(name) {
    if (!this.collections[name]) {
      this.collections[name] = new Collection(name, this.storageType);
    }
    return this.collections[name];
  }
}

class Collection {
  constructor(name, storageType) {
    this.name = name;
    this.storageType = storageType;
    this.storage = storageType === 'indexedDB' ? new IndexedDBStorage(name) : new LocalStorageStorage(name);
  }

  async create(data) {
    const id = this._generateId();
    const document = { _id: id, ...data, createdAt: new Date(), updatedAt: new Date() };
    await this.storage.setItem(id, document);
    return document;
  }

  async createMany(documents) {
    const results = [];
    for (const doc of documents) {
      const id = this._generateId();
      const document = { _id: id, ...doc, createdAt: new Date(), updatedAt: new Date() };
      await this.storage.setItem(id, document);
      results.push(document);
    }
    return results;
  }

  async find(query = {}, options = {}) {
    const { sort, limit, skip = 0, select } = options;
    let documents = await this._getAllDocuments();
    
    // Apply query filters
    documents = documents.filter(doc => this._matchQuery(doc, query));

    // Apply sort
    if (sort) {
      const [field, order] = Object.entries(sort)[0];
      documents.sort((a, b) => {
        return order === 'desc' ? 
          (b[field] > a[field] ? 1 : -1) : 
          (a[field] > b[field] ? 1 : -1);
      });
    }

    // Apply pagination
    documents = documents.slice(skip, limit ? skip + limit : undefined);

    // Apply field selection
    if (select) {
      documents = documents.map(doc => this._applyProjection(doc, select));
    }

    return documents;
  }

  async findOne(query = {}, options = {}) {
    const documents = await this.find(query, { ...options, limit: 1 });
    return documents[0] || null;
  }

  async findById(id, select) {
    const doc = await this.storage.getItem(id);
    return doc ? (select ? this._applyProjection(doc, select) : doc) : null;
  }

  async update(query, update, options = {}) {
    const { multi = false, upsert = false } = options;
    const documents = await this._getAllDocuments();
    const matches = documents.filter(doc => this._matchQuery(doc, query));
    
    if (matches.length === 0 && upsert) {
      const newDoc = await this.create({ ...query, ...update });
      return { modifiedCount: 0, upsertedId: newDoc._id };
    }

    const updateCount = multi ? matches.length : Math.min(matches.length, 1);
    const updatedDocs = [];

    for (let i = 0; i < updateCount; i++) {
      const doc = matches[i];
      let updated = { ...doc };

      // Handle update operators
      Object.entries(update).forEach(([key, value]) => {
        if (key.startsWith('$')) {
          switch(key) {
            case '$set':
              Object.assign(updated, value);
              break;
            case '$unset':
              Object.keys(value).forEach(field => delete updated[field]);
              break;
            case '$inc':
              Object.entries(value).forEach(([field, amount]) => {
                updated[field] = (updated[field] || 0) + amount;
              });
              break;
            case '$push':
              Object.entries(value).forEach(([field, item]) => {
                if (!Array.isArray(updated[field])) updated[field] = [];
                updated[field].push(item);
              });
              break;
            case '$pull':
              Object.entries(value).forEach(([field, condition]) => {
                if (Array.isArray(updated[field])) {
                  updated[field] = updated[field].filter(item => 
                    !this._matchQuery({ item }, { item: condition })
                  );
                }
              });
              break;
          }
        } else {
          updated[key] = value;
        }
      });

      updated.updatedAt = new Date();
      await this.storage.setItem(doc._id, updated);
      updatedDocs.push(updated);
    }

    return { 
      modifiedCount: updateCount,
      modifiedDocs: updatedDocs
    };
  }

  async updateMany(query, update, options = {}) {
    return this.update(query, update, { ...options, multi: true });
  }

  async remove(query, options = {}) {
    const { multi = false } = options;
    const documents = await this._getAllDocuments();
    const matches = documents.filter(doc => this._matchQuery(doc, query));
    const deleteCount = multi ? matches.length : Math.min(matches.length, 1);

    for (let i = 0; i < deleteCount; i++) {
      await this.storage.removeItem(matches[i]._id);
    }

    return { deletedCount: deleteCount };
  }

  async aggregate(pipeline = []) {
    let documents = await this._getAllDocuments();

    for (const stage of pipeline) {
      if (stage.$match) {
        documents = documents.filter(doc => this._matchQuery(doc, stage.$match));
      }
      if (stage.$sort) {
        const [field, order] = Object.entries(stage.$sort)[0];
        documents.sort((a, b) => {
          return order === -1 ? 
            (b[field] > a[field] ? 1 : -1) : 
            (a[field] > b[field] ? 1 : -1);
        });
      }
      if (stage.$limit) {
        documents = documents.slice(0, stage.$limit);
      }
      if (stage.$skip) {
        documents = documents.slice(stage.$skip);
      }
      if (stage.$group) {
        const groups = {};
        const groupId = stage.$group._id;
        
        // Extract the field name from the group _id (e.g., '$city' -> 'city')
        const field = groupId.startsWith('$') ? groupId.slice(1) : groupId;
        
        documents.forEach(doc => {
          const key = doc[field];
          if (!groups[key]) {
            groups[key] = {
              _id: key,
              count: 0,
              docs: []
            };
          }
          groups[key].count++;
          groups[key].docs.push(doc);
        });
        
        documents = Object.values(groups);
      }
    }

    return documents;
  }

  _generateId() {
    // Get timestamp in hex
    const timestamp = Date.now().toString(16);
    
    // Generate 3 random characters and convert to hex
    const randomStr = Array(3)
      .fill(0)
      .map(() => Math.floor(Math.random() * 16).toString(16))
      .join('');
    
    // Combine for final ID
    return `${timestamp}${randomStr}`;
  }

  _matchQuery(doc, query) {
    return Object.entries(query).every(([key, value]) => {
      // Handle field selection with projection
      if (key === '$select') {
        return true; // Skip matching, handle in find()
      }

      if (typeof value === 'object' && value !== null) {
        // Handle operators
        return Object.entries(value).every(([op, val]) => {
          switch(op) {
            case '$eq': return doc[key] === val;
            case '$ne': return doc[key] !== val;
            case '$gt': return doc[key] > val;
            case '$gte': return doc[key] >= val;
            case '$lt': return doc[key] < val;
            case '$lte': return doc[key] <= val;
            case '$in': return Array.isArray(val) && val.includes(doc[key]);
            case '$nin': return Array.isArray(val) && !val.includes(doc[key]);
            case '$regex': {
              const regex = val instanceof RegExp ? val : new RegExp(val);
              return regex.test(doc[key]);
            }
            case '$exists': return (key in doc) === val;
            case '$type': return typeof doc[key] === val;
            case '$mod': return Array.isArray(val) && doc[key] % val[0] === val[1];
            case '$all': return Array.isArray(val) && Array.isArray(doc[key]) && 
              val.every(v => doc[key].includes(v));
            case '$size': return Array.isArray(doc[key]) && doc[key].length === val;
            case '$or': return Array.isArray(val) && val.some(v => this._matchQuery(doc, v));
            case '$and': return Array.isArray(val) && val.every(v => this._matchQuery(doc, v));
            case '$nor': return Array.isArray(val) && !val.some(v => this._matchQuery(doc, v));
            default: return false;
          }
        });
      }
      return doc[key] === value;
    });
  }

  _applyProjection(doc, projection) {
    if (!projection) return doc;
    
    const result = {};
    Object.entries(projection).forEach(([field, include]) => {
      if (include) {
        const value = field.split('.').reduce((obj, key) => obj?.[key], doc);
        if (value !== undefined) {
          result[field] = value;
        }
      }
    });
    return Object.keys(projection).length ? result : doc;
  }

  async _getAllDocuments() {
    return await this.storage.getAll();
  }
}

class LocalStorageStorage {
  constructor(collectionName) {
    this.collectionName = collectionName;
  }

  async setItem(id, value) {
    const key = `${this.collectionName}_${id}`;
    localStorage.setItem(key, JSON.stringify(value));
  }

  async getItem(id) {
    const key = `${this.collectionName}_${id}`;
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  }

  async removeItem(id) {
    const key = `${this.collectionName}_${id}`;
    localStorage.removeItem(key);
  }

  async getAll() {
    const documents = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(`${this.collectionName}_`)) {
        documents.push(JSON.parse(localStorage.getItem(key)));
      }
    }
    return documents;
  }
}

class IndexedDBStorage {
  constructor(collectionName) {
    this.dbName = 'MangoDB';
    this.collectionName = collectionName;
    this.dbVersion = 1;
  }

  async getDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.collectionName)) {
          db.createObjectStore(this.collectionName);
        }
      };
    });
  }

  async setItem(id, value) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.collectionName, 'readwrite');
      const store = transaction.objectStore(this.collectionName);
      const request = store.put(value, id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getItem(id) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.collectionName, 'readonly');
      const store = transaction.objectStore(this.collectionName);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async removeItem(id) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.collectionName, 'readwrite');
      const store = transaction.objectStore(this.collectionName);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getAll() {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.collectionName, 'readonly');
      const store = transaction.objectStore(this.collectionName);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
}

// Export for both browser and module environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MangoDB;
} else {
  window.MangoDB = MangoDB;
}
