var oracle = require('oracledb'),
    debug = require('debug'),
    logTrace = debug('oracle-json:trace'),
    logInfo = debug('oracle-json:info'),
    logError = debug('oracle-json:error');

module.exports = OJConn;

function OJConn(connId, connection) {
    if (!(this instanceof OJConn)) return new OJConn(connId, connection);
    this.connection = connection;
    this.connId = connId;
    this.lastExecTime;
    this.lastExecProcName;
}

// callback optional.
OJConn.prototype.release = function(callback){
    var self = this;
    this.connection.release(function(err){
        if (err) {
            logError('release() id:%s Release Oracle Error:%s', self.connId, err);
            return callback && callback();
        }
        logTrace("release() id:%s connection released.", self.connId);
        return callback && callback();
    })
};

/*  Execute a procedure which has one of the following signatures;
1.JSON in and JSON out
{procedure:"pkg_test.getPrice",request:"query",output:true} using the req.query params
{procedure:"pkg_test.getPrice",request:"body",output:true} using the req.body params
{procedure:"pkg_test.getPrice",request:"allParams",output:true} using the req.allParams object
{procedure:"pkg_test.",inputs:{planID:600,adults:1,children:0,students:0},output:true} using explicit inputs
2.JSON in and nothing out
{procedure:"pkg_rest_api.updateObj",request:"body"};
3.nothing in and JSON out
{procedure:"pkg_test.getConfig",output:true};
4.nothing in and nothing out
{procedure:"pkg_test.runit"};

Also puts the results in a cache if desired with a key based on the request

*/
//OJConn.prototype.execute = function(dbRequest, req, res, next) {
OJConn.prototype.execute = function(dbRequest, inputData, callback) {
    var self = this;
    var callParams = getCallParams(dbRequest, inputData);
    var callString = getCallString(dbRequest, callParams.length);
    //we do not want to log debug information for request params on the debugMaskList credit card numbers etc....
    var logParams =  getCallParams(dbRequest, inputData,true);
    var options = getCallOptions(dbRequest);

    logInfo('execute() id:%s CallString:%s | CallParams:%s', self.connId, callString, JSON.stringify(logParams));

    var startExec = new Date();
    self.connection.execute(callString, callParams, options, handle_result);
    function handle_result(err, results) {
        self.lastExecTime = (new Date() - startExec);
        self.lastExecProcName = dbRequest.query ? 'SQL_QUERY' : dbRequest.procedure.split(/[.]+/).pop();
        logInfo('[%sms] %s id:%s handle_result Oracle call returned', self.lastExecTime, self.lastExecProcName, self.connId);
        if (err) {
            logError("Oracle Error(1):%s", err);
            return callback(err);
        } else if (results && results.outBinds && results.outBinds.length > 0) {
            return processResults(results.outBinds, dbRequest, callback);
        } else if(results && results.resultSet){
            // processResults expects an Array for processing Cursors/ResultSets
            return processResults([results.resultSet], dbRequest, callback);
        }
        else if (dbRequest.output){
            logError("Oracle id:%s no results from database", results);
            return callback(new Error('Expected output but no results returned'));
        }
        else {
            logTrace("Oracle id:%s no results from database: dbRequest.output %s", self.connId, dbRequest.output, results);
            return callback();
        }
    };
};

function closeRS(resultSet, callback){
    resultSet.close(
      function(err)
      {
          if (err) { logError(err.message); }
          callback();
      });
}


function fetchRowsFromRS(id, resultSet, numRows, callback, results){
    var numRows = numRows || 10;
    results = results || [];
    resultSet.getRows( // get numRows rows
      numRows,
      function (err, rows)
      {
          if (err) {
              logError('fetchRowsFromRS error', err);
              closeRS(resultSet, function(){callback(err);})
          } else if (rows.length > 0) {   // got some rows
              results = results.concat(rows);
              logTrace('rs[%d] %d rows fetched', id, results.length);
              if (rows.length === numRows)  // might be more rows
                  fetchRowsFromRS(id, resultSet, numRows, callback, results);
              else  {
                  closeRS(resultSet, function(){callback(null, results);})
              }
          } else {
              closeRS(resultSet, function(){callback(null, results);})
          }
      });
}

function processResults (output, dbRequest, callback){
    if (dbRequest.outputType==='CURSOR' || dbRequest.query){
        var startFetch = new Date();
        var results = {};
        var resultCount = 0;
        output.forEach(function(element, index) {
            fetchRowsFromRS(index, element, dbRequest.numRows, function (err, rows) {
                if (err) {
                    return callback(err);
                }
                if (rows.length === 1 && rows[0].status && rows[0].status.toUpperCase() == 'ERROR') {
                    logError('Database Error:%s', JSON.stringify(rows[0]));
                    return callback(new Error("Database not OK"));
                }
                logInfo('rs[%d] %d rows fetched - [%sms]', index, rows.length, new Date() - startFetch);

                results[index] = rows;
                resultCount++;
                if (resultCount == output.length) {
                    // Once all results returned return them as Array;
                    debug('results.length', results.length);
                    return callback(null, results);
                }
            });
        });
        return;
    }
    output = output[0];
    if(!output) {
        return callback(new Error('Null LOB returned'));
    }
    if (dbRequest.outputType==='BLOB'){
        var resultData = new Buffer(0);
        output.on('error', function(err) { callback(err); });
        output.on('data', function (part) { resultData = Buffer.concat([resultData, part]); });
        output.on('close', function () {
            return processData(resultData, dbRequest, callback);
        });
    } else {
        output.setEncoding('utf8');
        var resultData = '';
        output.on('error', function(err) { callback(err); });
        output.on('close', function () {
            return processData(resultData, dbRequest, callback);
        });

        output.on('data', function (part) { resultData += part; });
    }
}

function processData (results, dbRequest, callback) {
    if(dbRequest.outputType === 'BLOB'){
        return callback(null, results);
    }

    var data;
    try {
        data = JSON.parse(results);
    } catch (err) {
        logError("Invalid JSON: %s", results);
        return callback(new Error('Database invalid response'));
    }

    if (data.status && data.status.toUpperCase() == 'ERROR') {
        logError('Database Error:%s', JSON.stringify(data));
        return callback(new Error("Database not OK"));
    }

    return callback(null, data);
};

/* Test a connection is valid by running the simplest Oracle Query*/
OJConn.prototype.test = function(callback) {
    var self = this;
    logTrace("test() connection id:%s", self.connId);
    self.connection.execute("SELECT 1 FROM dual", [], handle_result);

    function handle_result(err, results) {
        logTrace('test() id:%s Oracle call returned', self.connId);
        if (err) {
            logError('test() id:%s Oracle Error:%s', self.connId, err);
            return callback(err);
        }
        return callback();
    }
};

function getCallString(dbRequest, paramCount) {
    if(dbRequest.query){
        return dbRequest.query;
    }
    var callString = 'Begin ' + dbRequest.procedure + "(";

    for (var i = 1; i <= paramCount; i++) {
        if(i>1) {
            callString = callString + ",";
        }
        callString = callString + ":" + i;
    }
    callString = callString + "); End;";
    return callString;
}

function checkDebugMaskList(obj, propStr) {
    var parts = propStr.split(".");
    var cur = obj;
    for (var i=0; i<parts.length; i++) {
        if (!cur[parts[i]])
            return false;
        if (typeof cur[parts[i]] =='string'){
            cur[parts[i]]= '***';
        }
        cur = cur[parts[i]];
    }
    return true;
}

function getCallOptions(dbRequest) {
    var options = {};

    if(dbRequest.outputType === 'CURSOR' || dbRequest.query){
        options.outFormat = oracle.OBJECT;
    }
    if(dbRequest.query){
        options.resultSet = true;
    }

    return options;
}

var typeMapping = {
    CLOB : oracle.CLOB,
    BLOB : oracle.BLOB,
    CURSOR : oracle.CURSOR
};

function getCallParams(dbRequest, inputData, forLogging) {
    var callParams = [];
    if(dbRequest.query){
        // We'll bind by the names in the inputData object.
        return inputData || {};
    }
    if (inputData) {
        if (typeof dbRequest.debugMaskList !='undefined' && forLogging){
            for (var x=0;x< dbRequest.debugMaskList.length;x++){
                checkDebugMaskList(inputData, dbRequest.debugMaskList[x]);
            }
        }
        var  paramString = JSON.stringify(inputData);
        if(!forLogging && dbRequest.inputSplitSize && dbRequest.inputSplitNumber) {
            // Input requested to be split into inputSplitNumber of max inputSplitSize bytes.
            callParams = paramString.match(new RegExp(".{1," + dbRequest.inputSplitSize + "}", "g"));
            while(callParams.length < dbRequest.inputSplitNumber) {
                callParams.push(null);
            }
        } else {
            callParams.push(paramString);
        }
    }
    // Don't log the Output Params.
    if (dbRequest.output && !forLogging) {
        // Check if output type is BLOB
        var out = { type: typeMapping[dbRequest.outputType] || oracle.CLOB, dir: oracle.BIND_OUT };
        for(var x=0; x < (dbRequest.outputCount || 1); x++){
            callParams.push(out);
        }

    }
    return callParams;
}
