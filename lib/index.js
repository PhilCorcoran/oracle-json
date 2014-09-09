/*
Connects to an Oracle database and exceutes Oracle procedures using JSON inputs and outputs

*/
var oracle = require('oracle'),
    debug = require('debug')('oracle-json');
module.exports = OJ;

function OJ(options) {
    if (!(this instanceof OJ)) return new OJ(options);
    options = options || {};
    this.connection = undefined;
    if (!options.database || !options.database.hostname || !options.database.database || !options.database.user || !options.database.password) {
        throw new Error('Invalid database config. Expecting hostname, database, user, password');
    }
    this.dbSettings = options.database;
    this.keepOpen = (options.keepOpen && options.keepOpen == true) ? true : undefined;
    debug('keepOpen:%s', options.keepOpen);
    this.maxRetries = options.maxRetries ? parseInt(options.maxRetries) : 3;
    this.maxProcedures = options.maxProcedures ? parseInt(options.maxProcedures) : 3;
    this.executing = 0;
    this.totalExec = 0;
    this.retries = 0;
    this.startingUp = true;
    this.startTime = new Date();
    this.reconnects = [];
    if (!options.noTest) {
        this.reconnect();
    }
}
/* connect to oracle if not already connected */
OJ.prototype.connect = function() {
    var self = this;
    return function(req, res, next) {
        if (self.connection && self.connection.isConnected()) {
            return next();
        }
        self.reconnect(next);
    }
}
OJ.prototype.admin = function() {
    var self = this;
    return function(req, res, next) {
        if (req.url == '/admin' && req.method == 'GET') {
            var stats = {
                startTime: self.startTime,
                executing: self.executing,
                totalExecutions: self.totalExec,
                maxProcedures: self.maxProcedures,
                retried: self.retries,
                keepOpen: self.keepOpen,
                reconnectTimes: self.reconnects
            }
            res.setHeader('Content-Type', 'application/json');
            neverCache(res);
            if (!self.connection || !self.connection.isConnected()) {
                stats.connection = 'none';
                res.status(503);
            } else if (self.executing > self.maxProcedures) {
                stats.connection = 'busy';
                res.status(503);
            } else {
                stats.connection = 'good';
            }
            return res.send(stats);
        }
        return next();
    }
}

function neverCache(res) {
    res.setHeader('Cache-Control', 'no-cache,no-store,must-revalidate'); //HTTP 1.1
    res.setHeader('Pragma', 'no-cache'); //HTTP 1.0
    res.setHeader('Expires', 'Sat, 26 Jul 1997 05:00:00 GMT'); // Date in the past
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
OJ.prototype.execute = function(dbRequest) {
    var self = this;
    return function(req, res, next) {
        var callParams = getCallParams(dbRequest, req);
        var callString = getCallString(dbRequest);
        debug('execute() CallString:%s | CallParams:%s', callString, JSON.stringify(callParams));
        if (!self.connection || !self.connection.isConnected()) {
            return next(new Error('Connection is bad'));
        }
        self.executing++;
        self.totalExec++;
        self.connection.execute(callString, callParams, handle_result_err);

        function handle_result_err(err, results) {
            debug('handle_result  Oracle call returned');
            self.executing = self.executing - 1;
            if (err) {
                debug("Oracle Error(1):%s", err);
                self.close();
                if (dbRequest.noRespond) {
                    return next(new Error("Database Error"));
                }
                res.status(503).send({
                    status: 'Error',
                    error: 'Database Error'
                });
            } else if (!results || !results.returnParam) {
                debug("Oracle no results from database: dbRequest.output%s", dbRequest.output);
                if (dbRequest.output) {
                    if (dbRequest.noRespond) {
                        return next(new Error("Database Error"));
                    }
                    res.status(503).send({
                        status: 'Error',
                        error: 'Database Error'
                    });
                } else {
                    res.send({
                        status: 'OK',
                        results: 'none expected'
                    });
                }
            } else { // the database returned a result
                debug("Oracle returned a result");
                if (dbRequest.cache) {
                    dbRequest.cache.put(results.returnParam, req);
                }
                if (!res.get('Content-Type')) {
                    res.header('Content-Type', 'application/json');
                }
                var data;
                try {
                    data = JSON.parse(results.returnParam);
                } catch (err) {
                    return next(new Error('Database invalid response'));
                }
                if (data.status && data.status.toUpperCase() == 'ERROR') {
                    debug('Database Error:%s', JSON.stringify(data));
                    self.close();
                    if (dbRequest.noRespond) {
                        return next(new Error("Database not OK"));
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
                if (!self.keepOpen) {
                    debug("keepOpen is false");
                    self.close();
                }

            }
        };
    }
}
OJ.prototype.reconnect = function(next) {
    var self = this;
    debug("reconnect() connecting to Oracle");
    self.executing = 0;
    try {
        self.connection = oracle.connectSync(self.dbSettings);
        debug("reconnect() connected successfully to Oracle");
        self.retries = 0;
        self.reconnects = (self.reconnects.length < 300) ? self.reconnects : [];
        self.reconnects.push(new Date());
        self.startingUp = undefined;
    } catch (err) {
        debug('reconnect() Error:%s startingUp:%s', err.toString(), self.startingUp);
        if (self.startingUp) {
            debug("failed to connect on startup, exiting process");
            process.exit(1);
        }
        self.retries++;
        if (self.retries > self.maxRetries) {
            debug("reconnect() maximum number of retries(%s) exceeded by attempts(%s). total executions for this session(%s), exiting process", self.maxRetries, self.retries, self.totalExec);
            process.exit(1);
        }
        if (next) return next(new Error('Connection error'));
    }
    if (next) return next();
}

OJ.prototype.close = function() {
    var self = this;
    debug("close(): Oracle procedure executions:%s", self.executing);
    if (self.connection && self.connection.isConnected() && self.executing < 1) {
        try {
            self.connection.close();
            self.connection = undefined;
        } catch (err) {
            self.connection = undefined;
            debug('Error closing connection:%s', err.toString());
        }
    } else {
        debug("Warning: close() called but connection was null");
    }
}

OJ.prototype.test = function() {
    var self = this;
    return function(req, res, next) {
        debug('test() connection:%s',(undefined !=self.connection));
        if(!self.connection){
            return next();
        }
        self.connection.execute("SELECT 1 FROM dual", [], handle_result_err);
        function handle_result_err(err, results) {
            debug('test()  Oracle call returned');
            if (err) {
                debug('test()  Oracle Error:%s', err);
                self.connection = undefined;
                return next();
            } else {
                return next();
            }
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

function getCallParams(dbRequest, req) {
    var callParams = [];
    if (dbRequest.inputs || dbRequest.request) {
        var paramString;
        if (dbRequest.inputs) {
            paramString = JSON.stringify(dbRequest.inputs);
        } else {
            paramString = JSON.stringify(req[dbRequest.request]);
        }
        callParams.push(paramString);
    }
    if (dbRequest.output) {
        var out = new oracle.OutParam(oracle.OCCICLOB);
        callParams.push(out);
    }
    return callParams;
}
