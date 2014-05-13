oracle-json
===========

nodejs module to call oracle stored procedures using json input and output params.
Automatically sends HTTP 503 response for stored procedure errors or when the database connection is lost.
Exits when the database connection is lost ( assumes it will be restarted automatically by `upstart` or some such process)
Requires the node `oracle` driver module

# Install

```bash
  npm install oracle-json
```
# Options:
''keepOpen'' maintains the connection to oracle between execution calls
''database'' connection parameters for the ''oracle'' node module.

# Examples:

The examples below assume the `express` module is also being used.

## Initialization

```js
var oj=require('oracle-json')(options);
```

### Called a Stored Procedure which returns JSON

```js
var priceCall={procedure:"pkg_test.getPrice",query:true,output:true} ;
app.get('/price',oj.execute(priceCall));

```


#Test
Install the required node modules and run `test.js` in the `test` directory. Used for testing with a mock oracle driver
```bash
npm install
node test.js
```

## Release History
|Version|Date|Description|
|:--:|:--:|:--|
|v0.4.0|2014-05-13|Keep the connection open if configured|
|v0.2.1|2013-12-18|Make one attempt to reconnect to Oracle per request|
|v0.1.1|2013-12-05|Initial Version|

# License 

(The MIT License)

Copyright (c) 2013 PC 

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
