const crypto = require('crypto'); // Ferramenta nativa do Node para gerar códigos
const dotenv = require('dotenv');
dotenv.config();
const cors = require('cors');
const express = require('express');
const mongoose = require('mongoose');
const { User, Pedido, Unidade } = require('./models/user');
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

        // 1. Gera um código de 6 números aleatórios
        const codigoGerado = Math.floor(100000 + Math.random() * 900000).toString();

        let usuarioExiste = await User.findOne({ email });

        if ( usuarioExiste) {

            if (usuarioExiste.isVerified) {
                return res.status(400).json({ erro: 'Esse e-mail já está cadastrado e validado no sistema'});
            } else {
                usuarioExiste.nome = nome;
                usuarioExiste.senha = senha;
                usuarioExiste.codigoVerificacao = codigoGerado;
                await usuarioExiste.save();
            }
        } else {
const novoUsuario = new User({
        nome,
        email,
        senha,
        codigoVerificacao: codigoGerado
        });

        // Salva no banco de dados

        await novoUsuario.save();
        }
        
        // Cria um novo usuário usando o molde (Model)



        // PREPARAR E ENVIAR O EMAIL

        const emailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: '☕ Anteiku - Seu código de verificação',
            html: `
              <div style="font-family: sans-serif; text-align: center;">
                <h2>Olá, ${nome}!</h2>
                <p>Para concluir seu cadastro, use o código abaixo:</p>
                <h1 style="color: #d4a373; font-size: 40px; letter-spacing: 5px;">${codigoGerado}</h1>
                <p>Digite este código na tela do site para liberar seu acesso.</p>
              </div>
            `
        };

        // Dispara o e-mail em segundo plano (sem o 'await' para não atrasar a resposta pro usuário)

        await transporter.sendMail(emailOptions);
        res.status(201).json({ mensagem: 'Código enviado para o e-mail!'});

    } catch (error) {
        if (error.code === 11000) return res.status(400).json({erro: 'Esse email já está cadastrado'});
        return res.status(500).json({erro: 'Erro interno no servidor.'});
    }
});


// --- ROTA DE VERIFICAÇÃO DO CÓDIGO ---
app.post('/api/verificar-codigo', async (req, res) => {
    try {
        const { email, codigo } = req.body;

        // 1. Procura o cliente na gaveta (banco de dados)
        const usuario = await User.findOne({ email });

        if (!usuario) {
            return res.status(404).json({ erro: 'Usuário não encontrado.' });
        }

        // 2. Confere se a chave que ele trouxe é a correta
        if (usuario.codigoVerificacao !== codigo) {
            return res.status(400).json({ erro: 'Código incorreto!' });
        }

        // 3. Destranca a conta e joga a chave fora
        usuario.isVerified = true;
        usuario.codigoVerificacao = undefined; 
        await usuario.save();

        // 4. Devolve o usuário para o React (assim o React consegue mostrar o cupom na tela!)
        res.status(200).json({ 
            mensagem: 'Conta verificada com sucesso!',
            usuario: usuario 
        });

    } catch (error) {
        res.status(500).json({ erro: 'Erro ao verificar código.' });
    }
});


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

        if (!usuarioEncontrado.isVerified) {
            return res.status(401).json({ erro: 'Acesso negado. Por favor, verifique seu e-mail com o código que enviamos no momento do cadastro.' });
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

app.put('/api/usuarios/resgatar-pontos', async (req, res) => {
    try {
        // Agora o React vai mandar o código do cupom também
        const { email, gasto, recompensaCodigo } = req.body;

        // Procura no banco (garantindo que o email esteja em minúsculo)
        const usuario = await User.findOne({ email: email.toLowerCase() });

        if (!usuario) {
            return res.status(404).json({ erro: 'Usuário não encontrado' });
        }

        // A VALIDAÇÃO REAL DO BANCO DE DADOS
        if (usuario.pontos < gasto) {
            return res.status(400).json({ erro: 'Saldo insuficiente no banco de dados' });
        }

        // Desconta os pontos
        usuario.pontos -= gasto;

        // 🎟️ Se a recompensa for um cupom, injeta na conta do usuário!
        if (recompensaCodigo) {
            usuario.cupom = recompensaCodigo;
        }

        await usuario.save();

        res.status(200).json({ mensagem: 'Recompensa resgatada!', pontosAtualizados: usuario.pontos });

    } catch (error) {
        res.status(500).json({ erro: 'Erro interno ao resgatar' });
    }
});
    
app.get('/', (req, res) => {
    res.send('Servidor está online');
});



// ROTA 1: Cliente faz o pedido
// --- ROTA DE CRIAR PEDIDO SEGURO ---
app.post('/api/pedidos', async (req, res) => {
    try {
        const { clienteNome, clienteEmail, itens, cupomDigitado } = req.body;

        // 1. Busca o usuário no banco para verificar se ele realmente possui esse cupom ativo
        const usuario = await User.findOne({ email: clienteEmail });

        let valorCalculadoPeloServidor = 0;
        let descontoAplicado = false;

        // 2. O Servidor faz a matemática rodar de forma isolada e segura
        itens.forEach((item) => {
            // Verifica se o cupom digitado bate com o cupom que o usuário tem direito no banco
            if (cupomDigitado === 'BEMVINDO50' && usuario && usuario.cupom === 'BEMVINDO50' && !descontoAplicado) {
                
                // Aplica 50% de desconto em apenas 1 unidade do produto
                const precoComDesconto = item.preco * 0.5;
                const unidadesPrecoCheio = item.preco * (item.quantidade - 1);
                
                valorCalculadoPeloServidor += precoComDesconto + unidadesPrecoCheio;
                descontoAplicado = true; // Bloqueia para não dar desconto em mais nada
            } else {
                valorCalculadoPeloServidor += item.preco * item.quantidade;
            }
        });

        // 3. Se o cupom foi usado com sucesso, nós "limpamos" o campo cupom do usuário no banco
        if (descontoAplicado && cupomDigitado === 'BEMVINDO50') {
            usuario.cupom = ''; // Remove o cupom para que ele se torne descartável (impossível re-utilizar)
            await usuario.save();
        }

        // 4. Salva o pedido com o valor blindado calculado pelo próprio servidor
        const novoPedido = new Pedido({
            clienteNome,
            clienteEmail,
            valor: valorCalculadoPeloServidor, // Valor seguro
            status: 'Pendente',
            itens: itens, // Guarda o que ele comprou
            data: new Date()
        });

        await novoPedido.save();
        res.status(201).json(novoPedido);

    } catch (error) {
        console.error(error);
        res.status(500).json({ erro: 'Erro ao registrar pedido com segurança' });
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

app.get('/api/unidades', async (req, res) => {
    try {
        // Busca todas as cafeterias cadastradas no estoque (MongoDB)
        const listaUnidades = await Unidade.find(); 
        
        // Entrega a lista pro garçom levar até o React
        res.status(200).json(listaUnidades); 
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao buscar as unidades no banco.' });
    }
});

app.listen(PORT, () => {
console.log(`Servidor está rodando na porta ${PORT}`);
})