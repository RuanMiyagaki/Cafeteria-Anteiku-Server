const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    nome: {
        type: String,
        required: [true, 'Nome é obrigatório'],
    },

    email: {
        type: String,
        required: [true, 'Email é obrigatório'],
        unique: true, // Não deixa cadastrar o mesmo e-mail duas vezes
        lowercase: true,

    },

    senha: {
        type: String,
        required: [true, 'Senha é obrigatória'],
        unique: true,
        lowercase: true,
    },

    cupom: {
        type: String,
        default: 'BEMVINDO10',
    },

    createdAt: {
        type: Date,
        default: Date.now, // O MongoDB carimba a data da criação sozinho!
    }


});

module.exports = mongoose.model('User', UserSchema);