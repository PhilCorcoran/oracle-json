/*
Connects to an Oracle database and exceutes Oracle procedures using JSON inputs and outputs
*/
var debug = require('debug')('oracle-json'),
    OJConn = require('./OJConnection');
module.exports = OJ;

function OJ(options) {
    if (!(this instanceof OJ)) return new OJ(options);
    this.options = options || {};
    this.names = (options.connectionNames && options.connectionNames.length == options.poolSize) ? options.connectionNames : ['jose', 'david', 'james', 'juan', 'mario'];
    if (!options.database || !options.database.hostname || !options.database.database || !options.database.user || !options.database.password) {
        throw new Error('Invalid database config. Expecting hostname, database, user, password');
    }
    this.options.poolSize = options.poolSize ? parseInt(options.poolSize) : 1;
    if (this.options.poolSize < 1 || options.poolSize > 5) {
        throw new Error('poolSize must be between 1 and 5');
    }
    this.connections = [];
    for (var i = 0; i < this.options.poolSize; i++) {
        var name = this.names[i];
        debug('OJ creating connection named:%s', name);
        this.connections.push(OJConn(name, this.options));
    }
    this.nextConn = 0;
    this.options.keepOpen = (options.keepOpen && (options.keepOpen == 'true' || options.keepOpen == true)) ? true : undefined;
    debug('this.keepOpen:%s', this.keepOpen);
    this.executing = 0;
    this.totalExec = 0;
    this.retries = 0;
    this.startingUp = true;
    this.startTime = new Date();
}

OJ.prototype.execute = function(dbRequest) {
    var self = this;
    return function(req, res, next) {
        debug('OJ execute() req.ojconn:%s', req.ojconn);
        req.ojconn = req.ojconn || self.connections[self.nextConn];
        return req.ojconn.execute(dbRequest, req, res, next);
    }
}

OJ.prototype.test = function(dbRequest) {
    var self = this;
    return function(req, res, next) {
        debug('OJ test() req.ojconn:%s', req.ojconn);
        req.ojconn = req.ojconn || self.connections[self.nextConn];
        return req.ojconn.test(req, res, next);
    }
}

OJ.prototype.connect = function() {
    var self = this;
    return function(req, res, next) {
        debug('OJ connect() nextConn:%s', self.nextConn);
        if (!req.ojconn) {
            req.ojconn = self.connections[self.nextConn]
            if (++self.nextConn >= self.options.poolSize) {
                self.nextConn = 0;
            }
        }
        return req.ojconn.connect(req, res, next);
    }
}
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
OJ.prototype.admin = function() {
    var self = this;
    return function(req, res, next) {
        if (req.url == '/admin' && req.method == 'GET') {
            var connStats = [];
            for (var i = 0; i < self.connections.length; i++) {
                if (self.connections[i]) {
                    connStats.push(self.connections[i].getStats());
                }
            }
            var stats = {
                keepOpen: ('' + self.options.keepOpen),
                connections: connStats
            };
            res.setHeader('Content-Type', 'application/json');
            neverCache(res);
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
