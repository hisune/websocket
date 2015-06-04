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
    this.status = constants.STATUS_HANDSHAKE;
    this.header = {}; // handshake http头
    this.reset();
};

// 接收数据
WebSocket.prototype.receive = function(data)
{
    this.data = data;

    switch(this.status){
        case constants.STATUS_HANDSHAKE:
            this.handShake();
            return;
        case constants.STATUS_NORMAL:
            this.reset(); // 重置
            this.handleProtocol();
            break;
        case constants.STATUS_SLICE:
            this.handleMessage();
            break;
        default :
            this.socket.destroy();
            return;
    }

    if(this.protocol.opcode == constants.OPCODE_CONTINUE || this.protocol.opcode == constants.OPCODE_TEXT){
        if(this.protocol.len == 0){ // 没有分片或者分片数据完了，理论上来说必须为0
            this.status = constants.STATUS_NORMAL;
            this.broadcast(this.protocol.msg); // 广播这条消息
        }else if(this.protocol.len > 0){
            this.status = constants.STATUS_SLICE;
        }else
            this.socket.destroy();
    }
};

// 发送握手返回
WebSocket.prototype.handShake = function()
{
    this.header = tools.getHeader(this.data); // 获取http头
    if(tools.checkHeader(this.header)){
        this.socket.write(tools.getHandshake(this.header), 'ascii'); // 响应完成握手
        this.status = constants.STATUS_NORMAL;
    }else
        this.socket.destroy();
};

// 获取所有帧内容，包括分片
WebSocket.prototype.handleProtocol = function()
{
    this.protocol = tools.getProtocol(this.data); // 获取协议字段信息
    if(this.protocol){
        switch(this.protocol.opcode){
            case constants.OPCODE_TEXT: // 发消息
                this.handleMessage(); // 获取消息内容
                break;
            case constants.OPCODE_CONTINUE: // 继续帧
                this.handleMessage(); // 获取消息内容
                break;
            case constants.OPCODE_PING: // ping
                this.pong();
                return true;
            case constants.OPCODE_PONG: // pong
                return true;
            case constants.OPCODE_CLOSE: // disconnect
                this.socket.destroy();
                return true;
            default: // unknown
                this.socket.destroy();
                return true;
        }
    }else{
        this.socket.destroy();
    }
};

// 获取消息内容
WebSocket.prototype.handleMessage = function()
{
    tools.getMessage(this.data, this.protocol);
    if(this.protocol.sliced){ // 如果是一个混合帧，则继续解析剩余帧内容的其他信息
        this.data = this.protocol.data; // 更新data为当前帧的剩余内容
        this.handleProtocol();
    }
};

// 重置帧内容
WebSocket.prototype.reset = function()
{
    this.msg = ''; // 内容
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

WebSocket.prototype.pong = function ()
{
    this.socket.write(new Buffer(['0x8A', '0x0']))
};

module.exports = WebSocket;