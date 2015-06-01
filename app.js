/**
 * Created by Hisune on 2015/6/1.
 * User: hi@hisune.com
 */
var WebSocket = require('./lib/websocket');
var clients = require('./lib/clients');
var client = new clients;
var port = 4000;


var server = require('net').createServer().listen(port, function(){
    console.log('websocket server run port ' + port + ' - demoed by hisune.com');
});

server.on('connection', function(socket){
    console.log('a');
    var ws = new WebSocket(socket, client.list);
    client.push(socket);

    socket.on('data', function(data){
        ws.receive(data);
    });

    socket.on('close', function(){
        console.log('b');
        client.remove(socket);
    });
});
