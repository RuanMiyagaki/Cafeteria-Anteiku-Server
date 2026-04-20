const crypto = require('crypto'); // Ferramenta nativa do Node para gerar códigos
const dotenv = require('dotenv');
dotenv.config();
const cors = require('cors');
const express = require('express');
const mongoose = require('mongoose');
const { User, Pedido } = require('./models/user');
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

        const usuarioEncontrado = await User.findOne({ email: email.toLowerCase() });
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

// Rota ESQUECI SENHA


app.post('/api/esqueci-senha', async (req, res) => {

try {

   const { email } = req.body;
   const usuario = await User.findOne({ email });

   if(!usuario) {
   return res.status(404).json({ erro: 'E-mail não localizado'});
   }

   // 1. Gera um Token aleatório de 20 caracteres
        const token = crypto.randomBytes(20).toString('hex');


        // 2. Salva no banco o token e o tempo de validade (1 hora)
        usuario.resetPasswordToken = token;
        usuario.resetPasswordExpires = Date.now() + 3600000; // +1 hora
        await usuario.save();

        // 3. Monta o link mágico que vai levar para o seu React
        const linkRecuperacao = `http://localhost:5173/redefinir-senha/${token}`;

        // 4. Envia o e-mail
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: '☕ Anteiku - Redefinição de Senha',
            html: `
                <div style="font-family: Arial, sans-serif; text-align: center;">
                    <h2>Olá, ${usuario.nome}!</h2>
                    <p>Você solicitou a redefinição da sua senha.</p>
                    <p>Clique no botão abaixo para criar uma nova senha:</p>
                    <a href="${linkRecuperacao}" style="background-color: #d4a373; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0;">
                        Redefinir Minha Senha
                    </a>
                    <p style="color: #888; font-size: 12px;">Se você não pediu isso, ignore este e-mail. O link expira em 1 hora.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        res.status(200).json({ mensagem: 'Link de recuperação enviado para o seu e-mail!' });

    } catch (error) {
        res.status(500).json({ erro: 'Erro ao processar recuperação.' });
    }

    });

    // 🚀 ROTA 2: RECEBE A NOVA SENHA E SALVA NO BANCO

    app.post('/api/redefinir-senha', async ( req, res) => {

    try {

     // Procura alguém que tenha ESSE token e que o tempo ainda NÃO expirou ($gt = greater than / maior que agora)

       const {token, novaSenha } = req.body;

       const usuario = await User.findOne({
       resetPasswordToken: token,
       resetPasswordExpires: { $gt: Date.now() }
       });

       if (!usuario) {

       return res.status(400).json({ erro: 'O link de recuperação está incorreto'});
     }


      // Salva a nova senha e apaga o token do banco (para não ser usado de novo)
        usuario.senha = novaSenha;
        usuario.resetPasswordToken = undefined;
        usuario.resetPasswordExpires = undefined;
        await usuario.save();

        res.status(200).json({ mensagem: 'Sua senha foi redefinida com sucesso!' });

        } catch (error) {
        res.status(500).json({ erro: 'Erro ao redefinir a senha.' });
    }

    });

app.put('/api/usuarios/pontos', async (req, res) => {
    try {
        const {email, pontosGanhos} = req.body;
        
        const usuarioAtualizado = await User.findOneAndUpdate(
            {email: email},
            {$inc: {pontos: pontosGanhos } }, // 🚀 $inc = SOMA com o que já tem!
            { new: true } // Retorna o usuário já com os pontos novos
            );
       res.status(200).json({ mensagem: 'Pontos adicionados!', pontos: usuarioAtualizado.pontos });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao salvar pontos no banco' });
    }
});



app.get('/', (req, res) => {
    res.send('Servidor está online');
});



// ROTA 1: Cliente faz o pedido
app.post('/api/pedidos', async (req, res) => {
    try {
        const novoPedido = new Pedido(req.body);
        await novoPedido.save();
        res.status(201).json(novoPedido);
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao registrar pedido' });
    }
});

// ROTA 2: Gerente lista todos os pedidos
app.get('/api/pedidos', async (req, res) => {
    try {
        const lista = await Pedido.find({status: 'Pendente'}).sort({ data: -1 }); // Mostra os mais recentes primeiro
        res.json(lista);
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao buscar pedidos' });
    }
});

// ADICIONE ESTA NOVA ROTA (Atualiza o pedido no banco)
app.put('/api/pedidos/:id/status', async (req, res) => {
    try {
        const pedidoId = req.params.id;
        const { status } = req.body;
        
        await Pedido.findByIdAndUpdate(pedidoId, { status: status });
        res.status(200).json({ mensagem: 'Status atualizado com sucesso' });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao atualizar status' });
    }
});

app.listen(PORT, () => {
console.log(`Servidor está rodando na porta ${PORT}`);
})