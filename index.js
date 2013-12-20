/*
Connects to an Oracle database and exceutes Oracle procedures.
execute expects to return a JSON result as an out parameter
execute_only expects no result
Some procedures accept a JSON input parameter while others take no parameter
*/
var oracle=require('oracle');
var connection=null;
var dbSettings=null;
function init(dbsettings){
        dbSettings=dbsettings;
}
function connect(successFunc,errorFunc){
        if(dbSettings===null){
                console.log("init() was never called "); 
                errorFunc();              
        }
        if(isConnected()){
                console.log("Already connected when connect() was called");
                successFunc();
        }
        console.log("Connecting to Oracle server:"+dbSettings.hostname);
        oracle.connect(dbSettings,function(err, ora_connection) {
                if(err){
                        console.log("Error: Could not connect to Oracle."+err);
                        close();
                        errorFunc();
                }else{
                        connection=ora_connection;
                        successFunc();
                }
        });
}

function isConnected(){
        if(connection===null){
                return false;
        }
        if(!connection.isConnected()){
                return false;
        }
        return true;
}
/*  Execute a procedure which returns a JSON clob 
        dbRequest={procedure,params,response,successFunc} 
        */
        function execute(dbRequest){
                if(dbRequest.params!==undefined){
                        var callString='call '+dbRequest.procedure+'(:1,:2)';
                        var paramString=JSON.stringify(dbRequest.params);
                        console.log("Oracle: "+callString +" params:"+paramString);
                        connection.execute(callString, [paramString,new oracle.OutParam(oracle.OCCICLOB)],handle_result_err);
                }else{
                        var callString='call '+dbRequest.procedure+'(:1)';
                        console.log("Oracle: "+callString);
                        connection.execute(callString, [new oracle.OutParam(oracle.OCCICLOB)],handle_result_err);
                }
                function handle_result_err(err,results){
                        if (err) {
                                console.log("Oracle Error(1): "+err);
                                close();
                                dbRequest.response.status(503).send("Database Error");
                        } else if(!results || ! results.returnParam) {
                                console.log("Oracle Error(2): no results from database");
                                dbRequest.response.status(503).send("Database Error");
                        }else {
                                dbRequest.successFunc(results.returnParam);
                        }
                };
        }
        function validate(dbRequest){
                if(dbSettings===null){
                        console.log("Error. init() was never called");
                        dbRequest.response.status(503).send("Database Error");
                }
                if(dbRequest.procedure===undefined){
                        console.log("Error. procedure is not defined");
                        dbRequest.response.status(503).send("Database Error");
                }
        }
        function connectExecute(dbRequest){
                var dbRequest=dbRequest;
                validate(dbRequest);
                if(!isConnected()){
                        console.log("Trying to connect to Oracle");
                        oracle.connect(dbSettings,function(err, ora_connection) {
                                if(err){
                                        console.log("Error: Could not connect to Oracle."+err);
                                        close();
                                        dbRequest.response.status(503).send("Database Error");
                                }else{
                                        connection=ora_connection;
                                        execute(dbRequest);
                                }
                        });
                }else{
                        execute(dbRequest);
                }
        }
        function connectExecuteOnly(dbRequest){
                var dbRequest=dbRequest;
                validate(dbRequest);
                if(dbSettings===null){
                        console.log("Error. init() was never called");
                        dbRequest.response.status(503).send("Database Error");
                }
                if(dbRequest.procedure===undefined){
                        console.log("Error. procedure is not defined");
                        dbRequest.response.status(503).send("Database Error");
                }
                if(!isConnected()){
                        console.log("Trying to connect to Oracle");
                        oracle.connect(dbSettings,function(err, ora_connection) {
                                if(err){
                                        console.log("Oracle Error(3): Could not connect to Oracle."+err);
                                        close();
                                        dbRequest.response.status(503).send("Database Error");
                                }else{
                                        connection=ora_connection;
                                        execute_only(dbRequest);
                                }
                        });
                }else{
                        execute_only(dbRequest);
                }
        }
        /* Execute a procedure which returns no results */
        function execute_only(dbRequest){
                if(dbRequest.params===undefined){
                        connection.execute("call"+dbRequest.procedure+"()", [],handle_result_err);
                }else{
                        var callString='call '+dbRequest.procedure+'(:1)';
                        var paramString=JSON.stringify(dbRequest.params);
                        console.log("Oracle:"+callString +" params:"+paramString);
                        connection.execute(callString, [paramString],handle_result_err);
                }
                function handle_result_err(err,results){
                        if (err) {
                                console.log("Oracle Error(4): "+err);
                                close();
                                dbRequest.response.status(503).send("Database Error");
                        }else {
                                dbRequest.successFunc();
                        }
                };
        }
        function close(){
                if(connection !==null){
                        connection.close();
                        connection=null;
                }else{
                        console.log("Error: close() called but connection was already null");
                }
        }
        exports.connectExecute=connectExecute;
        exports.connectExecuteOnly=connectExecuteOnly;
        exports.init=init;
        exports.close=close;
        exports.connect=connect;


