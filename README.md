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
`keepOpen` maintains the connection to oracle between execution calls  
`database` connection parameters for the ''oracle'' node module.   
`connectionNames` an array of friendly names for your connection  
`poolSize` number of connections in the pool  
`statsMax` maximum number of stats to collect before wiping and starting again  

The following options are used on the call to execute a procedure;  
`noRespond` do not automatically respond to the client but save results of procedure as `res.locals.data`  
`request` use the object named from express as the input to the procedure e.g. `request:"query"` will use `req.query`   
`inputs` specifiy the input parameters explicitly in this object  
`debugMaskList` array of object properties that should be masked in debug data e.g.  
  &nbsp;&nbsp;&nbsp;debugMaskList:["card.cardNumber","card.expDate"]  
`outputType` set to BLOB if database response is BLOB otherwise CLOB of JSON assumed e.g. outputType: "BLOB"  
  &nbsp;&nbsp;&nbsp;Results of procedure stored as `res.locals.data`


# Examples:

The examples below assume the `express` module is also being used.

## Initialization

```js
var oj=require('oracle-json')(options);
app.use(oj.connect());

```

### Called a Stored Procedure which returns JSON

```js
var priceCall={procedure:"pkg_test.getPrice",request:"body",output:true} ;
app.get('/price',oj.execute(priceCall));

```
### Guarantee your connection is good
`conntest()` runs the simplest query, `select 1 from dual` and reconnects on error. The overhead for this test seems about 2ms.

```js
var priceCall={procedure:"pkg_test.getPrice",request:"body",output:true} ;
app.get('/price',oj.conntest(),oj.execute(priceCall));
//execsafe includes conntest and execute
app.get('/pricesafe',oj.execsafe(priceCall));

```

## Release History
|Version|Date|Description|
|:--:|:--:|:--| 
|v1.0.3|2015-08-14|BLOB output type handled and oracle module updated to version 0.3.8|
|v1.0.2|2015-07-21|Split input parameter |  
|v1.0.1|2014-09-22|Test executions |  
|v1.0.0|2014-09-15|Connection pooling |  
|v0.8.5|2014-09-10|Check for keep open |  
|v0.8.4|2014-09-10|Close when test fails |  
|v0.8.3|2014-09-10|Reconnect when test fails |  
|v0.8.2|2014-09-09|Test a connection with a simple query |  
|v0.8.1|2014-09-08|Close connection |  
|v0.8.0|2014-09-08|Error status|  
|v0.7.10|2014-09-08|Monitor reconnect times|  
|v0.7.9|2014-09-07|Monitor total procedure executions|  
|v0.7.8|2014-09-01|Connection maxRetries|  
|v0.7.7|2014-09-01|Debug logging|  
|v0.7.6|2014-08-24|Raise an error when not responding directly. Otherwise send json error|
|v0.7.4|2014-08-22|Close on error status|
|v0.7.3|2014-08-21|Check database status returned|
|v0.7.2|2014-08-21|Parse JSON result|
|v0.6.5|2014-07-03|Use any object in the express request as input to the procedure call|
|v0.5.5|2014-07-03|Reverted to oracle0.3.4|
|v0.5.1|2014-07-02|Check TNS settings not used|
|v0.5.0|2014-07-02|Use oracle.connectSync|
|v0.4.2|2014-06-18|Option to use req.params as input|
|v0.4.1|2014-05-16|Configure whether to respond to the client|
|v0.4.0|2014-05-13|Keep the connection open if configured|
|v0.2.1|2013-12-18|Make one attempt to reconnect to Oracle per request|
|v0.1.1|2013-12-05|Initial Version|

# License 

(The MIT License)

Copyright (c) 2014 PC 

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
