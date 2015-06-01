/**
 * Created by Hisune on 2015/6/1.
 * User: hi@hisune.com
 *
 * 用来解析ws协议等
 */
var tools = require('./tools');
var constants = require('../const');

var WebSocket = function(socket, clients)
{
    this.socket = socket; // socket
    this.clients = clients;
    this.reset();
};

// 接收数据
WebSocket.prototype.receive = function(data)
{
    this.data = data;

    switch(this.status){
        case constants.STATUS_HANDSHAKE:
            this.handShake();
            break;
        case constants.STATUS_NORMAL:
            this.handleProtocol();
            break;
        case constants.STATUS_SLICE:
            this.handleMessage();
            break;
        default :
            this.socket.destroy();
    }
};

// 发送握手返回
WebSocket.prototype.handShake = function()
{
    this.header = tools.getHeader(this.data); // 获取http头
    this.socket.write(tools.getHandshake(this.header), 'ascii'); // 响应完成握手
    this.status = constants.STATUS_NORMAL;
};

// 获取所有帧内容，包括分片
WebSocket.prototype.handleProtocol = function()
{
    this.protocol = tools.getProtocol(this.data); // 获取协议字段信息
    this.handleMessage(); // 获取消息内容
    if(this.protocol.len <= 0){ // 没有分片或者分片数据完了
        this.status = constants.STATUS_NORMAL;
        this.broadcast(this.protocol.msg); // 广播这条消息
        this.reset(); // 重置
    }else
        this.status = constants.STATUS_SLICE;
};

// 获取消息内容
WebSocket.prototype.handleMessage = function()
{
    tools.getMessage(this.data, this.protocol);
};

// 重置帧内容
WebSocket.prototype.reset = function()
{
    this.status = constants.STATUS_HANDSHAKE;
    this.data = ''; // 内容
    this.header = {}; // handshake http头
    this.protocol = {}; // 数据帧详情
};

WebSocket.prototype.broadcast = function(text)
{
    var length = this.clients.length;
    for(var i = 0; i < length; i++){
        if(this.clients[i] != this.socket){ // 不发送给自己
            this.send(this.clients[i], text);
        }
    }
};

WebSocket.prototype.send = function(client, text)
{
    var buffer = tools.getSend(text);
    client.write(buffer);
};

module.exports = WebSocket;