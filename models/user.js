const mongoose = require('mongoose');

const unidadeSchema = new mongoose.Schema({
    nome: {type: String, required: [true, 'Nome da unidade é obrigatório']},
    endereco: {type: String, required: [true, 'Endereço é obrigatório']},
    horario: {type: String, required: [true, 'Horário é obrigatório']},
    latitude: {type: Number, required: [true, 'Latitude é obrigatória']},
    longitude: {type: Number, required: [true, 'Longitude é obrigatória']}
});




// 1. PRIMEIRO definimos as "receitas" (Schemas)
const UserSchema = new mongoose.Schema({
    nome: { type: String, required: [true, 'Nome é obrigatório'] },
    email: { 
        type: String, 
        required: [true, 'Email é obrigatório'], 
        unique: true, 
        lowercase: true 
        
    },
    
    resetPasswordToken: String,
    resetPasswordExpires: Date,

    
    senha: { 
        type: String, 
        required: [true, 'Senha é obrigatória'] 
        // ⚠️ DICA: Removi o 'unique: true' daqui. 
        // Duas pessoas podem ter a mesma senha (ex: 1234), isso não deve ser único.
    },
    isVerified: { type: Boolean, default: false },
    codigoVerificacao: { type: String },
    cupom: { type: String, default: 'BEMVINDO10' },
    createdAt: { type: Date, default: Date.now },
    pontos: { type: Number, default: 0 }
});

const pedidoSchema = new mongoose.Schema({
    clienteNome: String,
    clienteEmail: String,
    valor: Number,
    status: { type: String, default: 'Pendente' },
    data: { type: Date, default: Date.now }
});

// 2. DEPOIS criamos os modelos baseados nos Schemas
const User = mongoose.model('User', UserSchema);
const Pedido = mongoose.model('Pedido', pedidoSchema);
const Unidade = mongoose.model('Unidade', unidadeSchema);

module.exports = {
    User,
    Pedido: mongoose.model('Pedido', pedidoSchema),
    Unidade
};

