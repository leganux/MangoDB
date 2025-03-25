# MangoDB

A lightweight client-side database library that provides MongoDB-like functionality using localStorage or IndexedDB for storage.

## Features

- Collection-based data organization
- Support for both localStorage and IndexedDB storage engines
- MongoDB-like query API
- Automatic _id generation and timestamps (createdAt, updatedAt)
- Async/await support for all operations

## Installation

Include the MangoDB.js file in your project:

```html
<script src="MangoDB.js"></script>
```

## Usage

### Initialize Database

```javascript
// Use localStorage (default)
const db = new MangoDB();

// Or use IndexedDB
const db = new MangoDB('indexedDB');
```

### Collections

```javascript
const users = db.collection('users');
const products = db.collection('products');
```

### Create Documents

```javascript
// Create single document
const user = await users.create({
    name: 'John',
    age: 30,
    city: 'New York'
});

// Create multiple documents
const newUsers = await users.createMany([
    { name: 'Jane', age: 25, city: 'Los Angeles' },
    { name: 'Bob', age: 35, city: 'Chicago' }
]);
```

### Find Documents

```javascript
// Find all documents
const allUsers = await users.find();

// Find with query
const youngUsers = await users.find({ age: { $lt: 30 } });

// Find one document by query
const john = await users.findOne({ name: 'John' });

// Find document by ID
const user = await users.findById('195ce5502aa1ed');

// Find with sorting and pagination
const sortedUsers = await users.find(
    {},
    { 
        sort: { age: 'asc' },
        limit: 10,
        skip: 0
    }
);
```

### Update Documents

```javascript
// Update single document
const updateResult = await users.update(
    { name: 'John' },
    { age: 31, city: 'Boston' }
);

// Update multiple documents
const updateManyResult = await users.updateMany(
    { city: 'New York' },
    { country: 'USA' }
);
```

### Remove Documents

```javascript
// Remove single document
const removeResult = await users.remove({ name: 'John' });

// Remove multiple documents
const removeManyResult = await users.remove(
    { city: 'Chicago' },
    { multi: true }
);
```

### Aggregation Pipeline

```javascript
const results = await users.aggregate([
    { $match: { age: { $gt: 25 } } },
    { $group: { _id: '$city' } },
    { $sort: { '_id': 1 } },
    { $limit: 5 }
]);
```

## Query Operators

### Comparison
- `$eq`: Equals
- `$ne`: Not equals
- `$gt`: Greater than
- `$gte`: Greater than or equal
- `$lt`: Less than
- `$lte`: Less than or equal
- `$in`: Value in array
- `$nin`: Value not in array

### Logical
- `$and`: Logical AND
- `$or`: Logical OR
- `$nor`: Logical NOR

### Element
- `$exists`: Field exists
- `$type`: Field is of specified type

### Array
- `$all`: Array contains all elements
- `$size`: Array is of specified size

### Evaluation
- `$regex`: String matches pattern
- `$mod`: Modulo operation

Example:
```javascript
const users = await collection.find({
    $and: [
        { age: { $gt: 25, $lt: 50 } },
        { city: { $in: ['New York', 'Los Angeles'] } },
        { email: { $regex: /@gmail\.com$/ } },
        { skills: { $exists: true, $size: 3 } }
    ]
});
```

## Update Operators

### Fields
- `$set`: Set field value
- `$unset`: Remove field
- `$inc`: Increment field value

### Array
- `$push`: Add element to array
- `$pull`: Remove elements from array matching condition

Example:
```javascript
const result = await collection.update(
    { name: 'John' },
    {
        $set: { city: 'San Francisco' },
        $inc: { age: 1 },
        $push: { skills: 'JavaScript' },
        $unset: { temporary: 1 }
    }
);
```

## Field Selection

Select specific fields in queries:

```javascript
// Include only name and age
const users = await collection.find(
    { city: 'New York' },
    { select: { name: 1, age: 1 } }
);

// Same for findOne and findById
const user = await collection.findById(id, { name: 1, age: 1 });
```

## Storage Engines

### localStorage

- Simple key-value storage
- Synchronous operations wrapped in promises for consistent API
- Limited storage capacity (usually around 5-10 MB)
- Data persists until explicitly cleared

### IndexedDB

- More robust, larger storage capacity
- True asynchronous operations
- Better performance for large datasets
- Supports multiple databases and object stores

## Limitations

- No support for complex MongoDB features like transactions or joins
- Limited aggregation pipeline stages ($match, $sort, $group, $limit, $skip)
- Basic query operators only
- No indexes or performance optimizations

## Browser Support

- localStorage: All modern browsers
- IndexedDB: All modern browsers (IE 10+)
