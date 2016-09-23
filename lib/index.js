/*
Connects to an Oracle database and exceutes Oracle procedures using JSON inputs and outputs
*/
var debug = require('debug'),
    logTrace = debug('oracle-json:trace'),
    logInfo = debug('oracle-json:info'),
    logError = debug('oracle-json:error'),
    OJConn = require('./OJConnection'),
    path = require('path'),
    oracle = require('oracledb');

module.exports = OJ;

function OJ(options, callback) {
    if (!(this instanceof OJ)) return new OJ(options, callback);

    callback = callback || function() { logInfo('initialised')};
    this.connId = 0;
    this.connectionPool = null;
    this.clientId = options.clientId || getDefaultClientId();

    var dbSettings = options.database;
    var poolSettings = options.databasePool || {};
    if(dbSettings.autoCommit != undefined){
        oracle.autoCommit = dbSettings.autoCommit;
    }
    dbSettings.connectString = dbSettings.connectString || (dbSettings.hostname + '/' + dbSettings.database);
    dbSettings._enableStats = true;
    dbSettings.poolTimeout = poolSettings.poolTimeout || 30; // Unused connections closed after...
    dbSettings.queueTimeout = poolSettings.queueTimeout || 120000; // Time to wait for available connection
    dbSettings.poolMin =  poolSettings.poolMin || 0; // Minimum size the poll will shrink to
    dbSettings.poolMax =  poolSettings.poolMax || 1; // Size the pool can grow to

    if(dbSettings.poolMax < 1) {
        dbSettings.poolMax = 1;
        logInfo('poolMax invalid - defaulting to %d',  dbSettings.poolMax);
    }
    if(dbSettings.poolMin >= dbSettings.poolMax) {
        // poolMin must be less than poolMax
        dbSettings.poolMin = dbSettings.poolMax - 1;
        logInfo('poolMin invalid - defaulting to %d',  dbSettings.poolMin);
    }
    var self = this;
    oracle.createPool(dbSettings, function (err, pool) {
        if (err) {
            debug("failed to create connection pool on startup, exiting process", err, dbSettings);
            process.exit(1);
        }
        logInfo('Pool Created Successfully');
        self.connectionPool = pool;

        self.getConnection(function (conn) {
            conn.test(function (err) {
                if (err) {
                    logError('testConnection() Error:%s', err.toString());
                    process.exit(1);
                }
                conn.release();
                callback();
            });
        });
    });
}


OJ.prototype.getConnection = function(callback){
    var self = this;
    if(!self.connectionPool) {
        logInfo('OJ getConnection() - Waiting for DB pool startup')
        return setTimeout(OJ.prototype.getConnection.bind(this,callback), 1000);
    }
    logTrace('OJ getConnection()');
    self.connectionPool.getConnection(function(err, conn) {
        if (err) {
            logInfo('getConnection() Error:%s', err.toString());
            callback(null);
        }
        conn.clientId = self.clientId;
        return callback(OJConn(self.connId++, conn));
    })
};

function getDefaultClientId(){
    var splits =  (process.argv[1]).split(path.sep);
    splits.pop();
    return splits.pop() || "";
};

// Ensures the express req object has a connection set.
function setExpressConnection(self, req, next, callback){
    if (req && req.ojconn) {
        return callback();
    }
    self.getConnection(function(conn) {
        if(!conn){
            next(new Error ('Unable to obtain a connection'));
        }
        req.ojconn = conn;
        return callback();
    })
};

function sendError(noRespond, res, next){
    if (noRespond) {
        return next(new Error("Database Error"));
    }
    return res.status(503).send({
        status: 'Error',
        error: 'Database Error'
    });
}

function noData (dbRequest, res, next) {
    if (dbRequest.output) {
        return sendError(dbRequest.noRespond, res, next);
    } else {
        return res.send({
            status: 'OK',
            results: 'none expected'
        });
    }
}

OJ.prototype.execute = function(dbRequest) {
    var self = this;
    return function(req, res, next) {
        logTrace('OJ execute()');
        var inputData = dbRequest.inputs || (dbRequest.request ? req[dbRequest.request] : null);
        inputData = inputData && JSON.parse(JSON.stringify(inputData));
        setExpressConnection(self, req, next, function() {
            req.ojconn.execute(dbRequest, inputData, function (err, data) {
                req.ojconn.release();
                req.ojconn = undefined;
                if (err) {
                    return sendError(dbRequest.noRespond, res, next);
                }
                if (!data) {
                    return noData(dbRequest, res, next);
                }
                if (dbRequest.cache) {
                    dbRequest.cache.put(data, req);
                }
                if (dbRequest.noRespond) {
                    res.locals.data = data;
                    return next();
                }
                return res.send(data);
            });
        });
    }
};

OJ.prototype.test = function() {
    var self = this;
    return function(req, res, next) {
        debug('OJ test()');
        setExpressConnection(self, req, next, function() {
            req.ojconn.test(function (err) {
                if (err) {
                    req.ojconn.release();
                    req.ojconn = undefined;
                }
                next();
            });
        });
    }
};

OJ.prototype.connect = function() {
    var self = this;
    return function(req, res, next) {
        setExpressConnection(self, req, next, next);
    }
};

OJ.prototype.conntest = function() {
    var self = this;
    return [self.connect(), self.test(), self.connect()];
}
/*
 Verifies that the connection is good before executing the stored procedure

*/
OJ.prototype.execsafe = function(dbRequest) {
    var self = this;
    return [self.connect(), self.test(), self.connect(), self.execute(dbRequest)];
}

OJ.prototype.doExecsafe = function(dbRequest, callback) {
    var self = this;
    var inputData =JSON.parse(JSON.stringify(dbRequest.inputs));
    self.getConnection(function(conn) {
        if(!conn) {
            return callback(new Error("Unable to get a Connection"));
        }
        function handleResult (err, data) {
            conn.release();
            callback(err, data);
        }
        conn.test(function(err){
            if(err){
                conn.release();
                return self.getConnection(function(conn) {
                    if(!conn) {
                        return callback(new Error("Unable to get a Connection"));
                    }
                    return conn.execute(dbRequest, inputData, handleResult);
                });
            }
            return conn.execute(dbRequest, inputData, handleResult);
        });
    });
};

OJ.prototype.admin = function() {
    var self = this;
    return function(req, res, next) {
        if (req.url == '/admin' && req.method == 'GET') {
            var pool = self.connectionPool;
            var connStats = {
                pool : {
                    connectionsInUse : pool.connectionsInUse,
                    connectionsOpen : pool.connectionsOpen,
                    totalConnectionRequests : pool._totalConnectionRequests,
                    totalRequestsEnqueued : pool._totalRequestsEnqueued,
                    totalRequestsDequeued : pool._totalRequestsDequeued,
                    totalFailedRequests : pool._totalFailedRequests,
                    totalRequestTimeouts : pool._totalRequestTimeouts
                }
            };
            //res.setHeader('Content-Type', 'application/json');
            neverCache(res);
            return res.send(connStats);
        }
        return next();
    }
}

function neverCache(res) {
    res.setHeader('Cache-Control', 'no-cache,no-store,must-revalidate'); //HTTP 1.1
    res.setHeader('Pragma', 'no-cache'); //HTTP 1.0
    res.setHeader('Expires', 'Sat, 26 Jul 1997 05:00:00 GMT'); // Date in the past
}
