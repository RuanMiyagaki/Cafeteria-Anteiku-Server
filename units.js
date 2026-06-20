const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config(); 
const { Unidade } = require('./models/user'); 

async function units() {
    try {
       
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Conectado ao MongoDB');

        
        const novaUnidade = new Unidade({
            nome: "Anteiku - Distrito 20",
            endereco: "Rua da Estação, Próximo à Ward 20, Tokyo",
            horario: "Segunda a Sexta: 08:00 - 22:00",
            latitude: 35.6895,
            longitude: 139.6917
        });

        await novaUnidade.save();
        console.log('Primeira unidade da Anteiku salva com sucesso!');

    } catch (error) {
        console.error('Erro ao salvar a unidade:', error);
    } finally {
        await mongoose.disconnect(); 
    }
}

units();