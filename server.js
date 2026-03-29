const dotenv = require('dotenv');
dotenv.config();
const cors = require('cors');
const express = require('express');
const mongoose = require('mongoose');
const User = require('./models/user');
const nodemailer = require('nodemailer');


const app = express();
app.use(cors());
app.use(express.json()); // Permite que o servidor entenda JSON

const PORT = process.env.PORT || 5000;

// REALIZANDO A CONEXÃO COM O MONGO DB
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('Conectado ao MongoDB'))
.catch((err) => console.error('Erro ao conectar no MongoDB', err));


//CONFIGURAÇÃO DO NODEMAILER

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS

    }
});


// --- NOVA ROTA DE CADASTRO ---

app.post('/api/usuarios', async (req, res) => {
    try {
        const { nome, email, senha } = req.body;

        // Cria um novo usuário usando o molde (Model)

        const novoUsuario = new User({
        nome,
        email,
        senha
        });

        // Salva no banco de dados

        await novoUsuario.save();


        // PREPARAR E ENVIAR O EMAIL

        const emailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Sua conta na Anteiku foi criada com sucesso! ☕',
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <h2 style="color: #d4a373; text-align: center;">Bem-vindo(a) à Anteiku, ${nome}!</h2>
                <p>É um prazer ter você conosco. Seu cadastro foi realizado com sucesso e agora você faz parte do nosso clube de clientes.</p>
                <p>Para celebrar sua chegada, utilize o cupom abaixo em sua próxima visita para receber <strong>15% de desconto</strong>:</p>
                <div style="text-align: center; margin: 20px 0;">
                  <span style="background-color: #27ae60; color: white; padding: 10px 20px; font-size: 20px; font-weight: bold; border-radius: 5px;">ANTEIKU15</span>
                </div>
                <p>Esperamos te ver em breve!</p>
                <p style="font-size: 12px; color: #888; text-align: center; margin-top: 30px;">© 2026 Cafeteria Anteiku. Distrito 20.</p>
              </div>
            `
        };

        // Dispara o e-mail em segundo plano (sem o 'await' para não atrasar a resposta pro usuário)

        transporter.sendMail(emailOptions, (error, info) => {
            if (error) {
                console.error("Erro ao enviar o e-mail de boas vindas", error); 
            } else {
                console.log("E-mail de boas vindas enviado para:", info.accepted);
            }
        });



// Responde ao Front que deu tudo certo:

        res.status(201).json({ mensagem: 'Usuário cadastrado com sucesso', usuario: novoUsuario});
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({erro: 'Esse email já está cadastrado'});
        }

        return res.status(500).json({erro: 'Erro interno no servidor.'});
    }
})

// --- NOVA ROTA DE LOGIN ---
app.post('/api/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
       
        // 1. Procura no banco se existe algum usuário com esse e-mail

        const usuarioEncontrado = await User.findOne({ email });
        // Se não encontrar o e-mail, barra o acesso

        if (!usuarioEncontrado) {
            return res.status(400).json({erro: 'Usuário não localizado no sistema, verifique seu e-mail e tente novamente'});

        }

        // 2. Verifica se a senha que ele digitou bate com a do banco

        if (senha !== usuarioEncontrado.senha) {
            return res.status(400).json({erro: 'Senha incorreta'});


        }

        // 3. Se tudo estiver certo, libera o acesso e devolve os dados

        res.status(200).json({
            mensagem: 'Login realizado com sucesso',
            usuario: usuarioEncontrado
        });
    }


    catch (error) {

        console.error('Erro no login', error);
        res.status(500).json({erro: 'Erro interno do servidor'});
    }

});



app.get('/', (req, res) => {
    res.send('Servidor está online');
});

app.listen(PORT, () => {
console.log(`Servidor está rodando na porta ${PORT}`);
})