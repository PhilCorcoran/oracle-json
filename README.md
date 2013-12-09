oracle-json
===========

nodejs module to call oracle stored procedures using json input and output params.
Automatically sends HTTP 503 response for stored procedure errors or when the database connection is lost.
Exits when the database connection is lost ( assumes it will be restarted automatically by `upstart` or some such process)


# Install

```bash
  npm install oracle-json
```


# Examples:

The examples below assume the `express` module is also being used.

## Initialize (INIT):

```js
var oracle_json=require('oracle-json');
var settings = require('./settings.json');
oracle_json.connect(settings.database,start_app);
```

### Called a Stored Procedure which returns JSON

```js
		oracle_json.execute("pkg_any.GetPrice",req.query,res,function (data){
			res.send(data);
		});
```

## Call a Stored Procedure which returns nothing
```js
		oracle_json.execute_only("test_bad_procedure",req.query,res,function (data){
			res.send(data);
		});
```

#Test
Install the required node modules and run `test.js` in the `test` directory
```bash
npm install
node test.js
```

Browse to the following urls

`http://localhost:3336/price?product=22&catalog=music`

`http://localhost:3336/badprocedure`

simulates a bad procedure call or an Oracle error running the procedure

`http://localhost:3336/connectionlost`
simulates a lost connection. Node process will exit
```
## Release History
|Version|Date|Description|
|:--:|:--:|:--|
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
