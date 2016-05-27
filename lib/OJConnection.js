var oracle = require('oracledb'),
    debug = require('debug')('oracle-json');
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
            debug('release() id:%s Release Oracle Error:%s', self.connId, err);
            return callback && callback();
        }
        debug("release() id:%s connection released.", self.connId);
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

    debug('execute() id:%s CallString:%s | CallParams:%s', self.connId, callString, JSON.stringify(logParams));

    var startExec = new Date();
    self.connection.execute(callString, callParams, handle_result);
    function handle_result(err, results) {
        self.lastExecTime = (new Date() - startExec);
        self.lastExecProcName = dbRequest.procedure.split(/[.]+/).pop();
        debug('[%sms] %s id:%s handle_result Oracle call returned', self.lastExecTime, self.lastExecProcName, self.connId);
        if (err) {
            debug("Oracle Error(1):%s", err);
            return callback(err);
        } else if (results && results.outBinds && results.outBinds[0]) {
            debug("Oracle returned a result id:%s", self.connid);
            var lob = results.outBinds[0];
            return processLOB(lob, dbRequest, callback);
        } else {
            debug("Oracle id:%s no results from database: dbRequest.output%s", self.connId, dbRequest.output);
            return callback();
        }
    };
};

function processLOB(lob, dbRequest, callback){
    if (dbRequest.outputType==='BLOB'){
        var resultData = new Buffer(0);
        lob.on('error', function(err) { callback(err); });
        lob.on('data', function (part) { resultData = Buffer.concat([resultData, part]); });
        lob.on('close', function () {
            return processData(resultData, dbRequest, callback);
        });
    } else {
        var resultData = '';
        lob.on('error', function(err) { callback(err); });
        lob.on('data', function (part) { resultData += part; });
        lob.on('close', function () {
            return processData(resultData, dbRequest, callback);
        });
    }
}

function processData (results, dbRequest, callback) {
    if(dbRequest.outputType === 'BLOB'){
        return callback(null, results);
    }

    var data;
    try {
        debug('results',results);
        data = JSON.parse(results);
    } catch (err) {
        debug("Invalid JSON: %s", results);
        return callback(new Error('Database invalid response'));
    }

    if (data.status && data.status.toUpperCase() == 'ERROR') {
        debug('Database Error:%s', JSON.stringify(data));
        return callback(new Error("Database not OK"));
    }

    return callback(null, data);
};

/* Test a connection is valid by running the simplest Oracle Query*/
OJConn.prototype.test = function(callback) {
    var self = this;
    debug("test() connection id:%s", self.connId);
    self.connection.execute("SELECT 1 FROM dual", [], handle_result);

    function handle_result(err, results) {
        debug('test() id:%s Oracle call returned', self.connId);
        if (err) {
            debug('test() id:%s Oracle Error:%s', self.connId, err);
            return callback(err);
        }
        return callback();
    }
};

function getCallString(dbRequest, paramCount) {
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


function getCallParams(dbRequest, inputData, forLogging) {
    var callParams = [];
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
        var out = { type: dbRequest.outputType==='BLOB' ? oracle.BLOB : oracle.CLOB, dir: oracle.BIND_OUT };
        callParams.push(out);
    }
    return callParams;
}
