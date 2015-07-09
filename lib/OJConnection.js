var oracle = require('oracle'),
    debug = require('debug')('oracle-json');
module.exports = OJConn;

function OJConn(name, options) {
    if (!(this instanceof OJConn)) return new OJConn(name, options);
    debug('{%s} OJConn()', name);
    this.name = name;
    this.options = options || {};
    this.connection = undefined;
    this.dbSettings = options.database;
    this.keepOpen = (options.keepOpen && (options.keepOpen == 'true' || options.keepOpen == true)) ? true : undefined;
    this.statsMax = options.statsMax ? parseInt(options.statsMax) : 500;
    debug('{%s} this.keepOpen:%s', this.name, this.keepOpen);
    this.stats = {};
    this.stats.executing = 0;
    this.stats.execTimes = {};
    this.stats.totalExec = 0;
    this.startingUp = true;
    this.stats.startTime = new Date();
    this.stats.reconnects = [];
    this.reconnect();
}

/* connect to oracle if not already connected */
OJConn.prototype.connect = function(req, res, next) {
    var self = this;
    debug('{%s} connect()', self.name);
    if (self.connection && self.connection.isConnected()) {
        return next();
    }
    self.reconnect(next);
}
/* return monitoring stats */
OJConn.prototype.getStats = function() {
    var self = this;
    var stats = {
        name: self.name,
        startTime: self.startTime,
        executing: self.stats.executing,
        totalExecutions: self.stats.totalExec,
        executionTimes: self.stats.execTimes,
        reconnectTimes: self.stats.reconnects
    }
    return stats;
}

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
OJConn.prototype.execute = function(dbRequest, req, res, next) {
    var self = this;
    var callParams = getCallParams(dbRequest, req);
    var callString = getCallString(dbRequest);
    //we do not want to log debug information for request params on the debugMaskList credit card numbers etc....
    var logParams =  getCallParams(dbRequest, req,true);
    req.execID = self.stats.totalExec++;
    debug('{%s} execute() id:%s CallString:%s | CallParams:%s', self.name, req.execID, callString, JSON.stringify(logParams));
    if (!self.connection || !self.connection.isConnected()) {
        return next(new Error('Connection is bad'));
    }
    self.stats.executing++;
    var startExec = new Date();
    self.connection.execute(callString, callParams, handle_result);

    function handle_result(err, results) {
        var execTime = (new Date() - startExec);
        var procName = dbRequest.procedure.split(/[.]+/).pop();
        self.stats.execTimes[procName] = (self.stats.execTimes[procName] && self.stats.execTimes[procName].length < self.statsMax) ? self.stats.execTimes[procName] : [];
        self.stats.execTimes[procName].push(execTime);
        debug('{%s} [%sms] %s id:%s handle_result Oracle call returned', self.name, execTime, procName, req.execID);
        --self.stats.executing;
        if (err) {
            debug("{%s} Oracle Error(1):%s", err);
            return self.oracleError(err, dbRequest, res, next);
        } else if (results && results.returnParam) {
            debug("{%s} Oracle returned a result", self.name);
            return self.processData(results, dbRequest, req, res, next);
        }
        debug("{%s} Oracle no results from database: dbRequest.output%s", self.name, dbRequest.output);
        return self.noData(dbRequest, res, next);

    };
}
OJConn.prototype.noData = function(dbRequest, res, next) {
    var self = this;
    if (dbRequest.output) {
        self.close();
        if (dbRequest.noRespond) {
            return next(new Error("Database Error"));
        }
        return res.status(503).send({
            status: 'Error',
            error: 'Database Error'
        });
    } else {
        if (!self.keepOpen) {
            self.close();
        }
        return res.send({
            status: 'OK',
            results: 'none expected'
        });
    }
}
OJConn.prototype.oracleError = function(err, dbRequest, res, next) {
    var self = this;
    self.close();
    if (dbRequest.noRespond) {
        return next(new Error("Database Error"));
    }
    return res.status(503).send({
        status: 'Error',
        error: 'Database Error'
    });
}
OJConn.prototype.processData = function(results, dbRequest, req, res, next) {
    var self = this;
    if (!res.get('Content-Type')) {
        res.header('Content-Type', 'application/json');
    }
    var data;
    try {
        data = JSON.parse(results.returnParam);
    } catch (err) {
        debug("{%s} Invalid JSON: %s", self.name, results.returnParam);
        return next(new Error('Database invalid response'));
    }
    if (dbRequest.cache) {
        dbRequest.cache.put(data, req);
    }
    if (!self.keepOpen) {
        self.close();
    }
    if (data.status && data.status.toUpperCase() == 'ERROR') {
        debug('{%s} Database Error:%s', JSON.stringify(data));
        self.close();
        if (dbRequest.noRespond) {
            var err = new Error("Database not OK");
            err.data=data;
            return next(err);
        } else {
            res.status(503).send({
                status: 'Error',
                error: 'Database Error'
            });
        }
    }
    if (dbRequest.noRespond) {
        res.locals.data = data;
        return next();
    }
    res.send(data);
}

OJConn.prototype.reconnect = function(next) {
    var self = this;
    debug("{%s} reconnect() connecting to Oracle", self.name);
    self.stats.executing = 0;
    try {
        self.connection = oracle.connectSync(self.dbSettings);
        debug("{%s} reconnect() connected successfully to Oracle", self.name);
        self.stats.reconnects = (self.stats.reconnects.length < self.statsMax) ? self.stats.reconnects : [];
        self.stats.reconnects.push(new Date());
        self.startingUp = undefined;
    } catch (err) {
        debug('{%s} reconnect() Error:%s startingUp:%s', self.name, err.toString(), self.startingUp);
        if (self.startingUp) {
            debug("{%s} failed to connect on startup, exiting process");
            process.exit(1);
        }
        if (next) return next(new Error('Connection error'));
    }
    if (next) return next();
}

OJConn.prototype.close = function() {
    var self = this;
    debug("{%s} close() : Oracle procedure executions:%s", self.name, self.stats.executing);
    if (self.connection && self.connection.isConnected() && self.stats.executing < 1) {
        try {
            self.connection.close();
            self.connection = undefined;
        } catch (err) {
            self.connection = undefined;
            debug('{%s} Error closing connection {%s} :%s', self.name, err.toString());
        }
    } else {
        debug("{%s} Warning: close() called but connection was null");
    }
}

/* Test a connection is valid by running the simplest Oracle Query*/
OJConn.prototype.test = function(req, res, next) {
    var self = this;
    debug('{%s} test() connected:%s', self.name, (undefined != self.connection));
    if (!self.connection) {
        return next();
    }
    self.stats.executing++;
    self.connection.execute("SELECT 1 FROM dual", [], handle_result);

    function handle_result(err, results) {
        --self.stats.executing;
        debug('{%s} test() Oracle call returned', self.name);
        if (err) {
            debug('{%s} test() Oracle Error:%s', self.name, err);
            try {
                self.close();
            } catch (err) {
                self.connection = undefined;
                debug('{%s} Error closing connection:%s', err.toString());
            }
            return next();
        } else {
            return next();
        }
    }
}

function getCallString(dbRequest) {
    var callString = 'call ' + dbRequest.procedure;
    if (dbRequest.inputs || dbRequest.request) {
        if (!dbRequest.output) {
            callString += '(:1)';
        } else {
            callString += '(:1,:2)';
        }
    } else {
        if (!dbRequest.output) {
            callString += '()';
        } else {
            callString += '(:1)';
        }
    }
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


function getCallParams(dbRequest, req,useDebugMaskList) {
    var callParams = [];
    if (dbRequest.inputs || dbRequest.request) {
        var inputs;
        var paramString;
        if (dbRequest.inputs) {
            inputs=JSON.parse(JSON.stringify(dbRequest.inputs));
        } else {
            inputs=JSON.parse(JSON.stringify(req[dbRequest.request]));
        }
        if (typeof dbRequest.debugMaskList !='undefined' && useDebugMaskList){
            for (var x=0;x< dbRequest.debugMaskList.length;x++){
                checkDebugMaskList(inputs, dbRequest.debugMaskList[x]);
            }
        }
        paramString = JSON.stringify(inputs);
        callParams.push(paramString);
    }
    if (dbRequest.output) {
        var out = new oracle.OutParam(oracle.OCCICLOB);
        callParams.push(out);
    }
    return callParams;
}
