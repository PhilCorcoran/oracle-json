/*
        Connects to an Oracle database and exceutes Oracle procedures.
        execute expects to return a JSON result as an out parameter
        execute_only expects no result
        Some procedures accept a JSON input parameter while others take no parameter
*/
var oracle=require('oracle');
var connection;
function connect(dbsettings,nextFunction) {
        oracle.connect(dbsettings, function(err, ora_connection) {
                if(err){
                        console.log("Error: Could not connect to Oracle. Exiting"+err);
                        process.exit(1);
                }else{
                        connection=ora_connection;
                        nextFunction();
                }
        });
}
function validate(procedure_name,res){
        if(procedure_name===undefined){
                throw Error("Oracle Procedure name is not defined");
        }
        if (connection ===undefined || !connection.isConnected()) {
                res.status(503).send("Database Error");
                console.log("Error: Oracle connection is dead. Exiting");
                process.exit(1);
        }        
}
/*  Execute a procedure which returns a JSON clob */
function execute(procedure_name,params,res,nextFunc){
        var nextFunction=nextFunc;
        validate(procedure_name,res);
        if(params!==undefined){
                var callString='call '+procedure_name+'(:1,:2)';
                var paramString=JSON.stringify(params);
                console.log("Oracle: "+callString +" params:"+paramString);
                connection.execute(callString, [paramString,new oracle.OutParam(oracle.OCCICLOB)],handle_result_err);
        }else{
                var callString='call '+procedure_name+'(:1)';
                console.log("Oracle: "+callString);
                connection.execute(callString, [new oracle.OutParam(oracle.OCCICLOB)],handle_result_err);
        }
        function handle_result_err(err,results){
                if (err) {
                        console.log("Oracle Error: "+err);
                        res.status(503).send("Database Error");
                } else if(!results || ! results.returnParam) {
                        console.log("Oracle Error: no results from database");
                        res.status(503).send("Database Error");
                }else {
                        nextFunction(results.returnParam);
                }
        };
}
/* Execute a procedure which returns no results */
function execute_only(procedure_name,params,res,nextFunc){
        var nextFunction=nextFunc;
        validate(procedure_name,res);
        if(params===undefined){
                connection.execute("call"+procedure_name+"()", [],handle_result_err);
        }else{
                var callString='call '+procedure_name+'(:1)';
                var paramString=JSON.stringify(params);
                console.log("Oracle:"+callString +" params:"+paramString);
                connection.execute(callString, [JSON.stringify(params)],handle_result_err);
        }
        function handle_result_err(err,results){
                if (err) {
                        console.log("Oracle Error: "+err);
                        res.status(503).send("Database Error");
                }else {
                        nextFunction();
                }
        };
}
function close(){
        if(connection !==undefined){
                connection.close();
        }else{
                throw Error("Connection was already closed");
        }
}
exports.connect=connect;
exports.close=close;
exports.execute=execute;
exports.execute_only=execute_only;

