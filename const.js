/**
 * Created by Hisune on 2015/6/1.
 * User: hi@hisune.com
 */

module.exports = {
    STATUS_HANDSHAKE: 0, // handshake
    STATUS_NORMAL: 1, // 正常状态
    STATUS_SLICE: 2, // 分片状态

    OPCODE_CONTINUE: 0, // 继续帧
    OPCODE_TEXT: 1, // 文本
    OPCODE_BINARY: 2, // 二进制
    OPCODE_CLOSE: 8, // 关闭连接
    OPCODE_PING: 9, // ping
    OPCODE_PONG: 10 // pong

};