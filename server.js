const crypto = require('crypto'); // Ferramenta nativa do Node para gerar códigos
const dotenv = require('dotenv');
dotenv.config();
const cors = require('cors');
const express = require('express');
const mongoose = require('mongoose');
const { User, Pedido, Unidade } = require('./models/user');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json()); // Permite que o servidor entenda JSON

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'secretKeyAnteikuDistrito20';

// REALIZANDO A CONEXÃO COM O MONGO DB
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('Conectado ao MongoDB'))
.catch((err) => console.error('Erro ao conectar no MongoDB', err));


// CONFIGURAÇÃO DO NODEMAILER
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// --- MIDDLEWARES DE SEGURANÇA ---

// 1. Exige autenticação por JWT
const autenticarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ erro: 'Acesso negado. Token de autenticação não fornecido.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ erro: 'Sessão expirada ou token inválido. Faça login novamente.' });
        }
        req.user = user;
        next();
    });
};

// 2. Identifica o usuário se houver token, mas não barra se for Guest
const identificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return next();

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (!err) {
            req.user = user;
        }
        next();
    });
};

// 3. Garante que apenas o Gerente acesse a rota
const verificarGerente = (req, res, next) => {
    if (req.user && req.user.email === 'kakashacafe@gmail.com') {
        next();
    } else {
        return res.status(403).json({ erro: 'Acesso negado. Apenas o Gerente Yoshimura possui acesso a este recurso.' });
    }
};


// --- ROTA DE CADASTRO ---
app.post('/api/usuarios', async (req, res) => {
    try {
        const { nome, email, senha } = req.body;

        // 1. Gera um código de 6 números aleatórios
        const codigoGerado = Math.floor(100000 + Math.random() * 900000).toString();

        let usuarioExiste = await User.findOne({ email: email.toLowerCase() });

        // Criptografa a senha com Bcrypt
        const hashedSenha = await bcrypt.hash(senha, 10);

        if (usuarioExiste) {
            if (usuarioExiste.isVerified) {
                return res.status(400).json({ erro: 'Esse e-mail já está cadastrado e validado no sistema' });
            } else {
                usuarioExiste.nome = nome;
                usuarioExiste.senha = hashedSenha;
                usuarioExiste.codigoVerificacao = codigoGerado;
                await usuarioExiste.save();
            }
        } else {
            const novoUsuario = new User({
                nome,
                email: email.toLowerCase(),
                senha: hashedSenha,
                codigoVerificacao: codigoGerado
            });

            // Salva no banco de dados
            await novoUsuario.save();
        }

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

        // Dispara o e-mail em segundo plano
        await transporter.sendMail(emailOptions);
        res.status(201).json({ mensagem: 'Código enviado para o e-mail!' });

    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ erro: 'Esse e-mail já está cadastrado' });
        return res.status(500).json({ erro: 'Erro interno no servidor.' });
    }
});


// --- ROTA DE VERIFICAÇÃO DO CÓDIGO ---
app.post('/api/verificar-codigo', async (req, res) => {
    try {
        const { email, codigo } = req.body;

        const usuario = await User.findOne({ email: email.toLowerCase() });

        if (!usuario) {
            return res.status(404).json({ erro: 'Usuário não encontrado.' });
        }

        if (usuario.codigoVerificacao !== codigo) {
            return res.status(400).json({ erro: 'Código incorreto!' });
        }

        usuario.isVerified = true;
        usuario.codigoVerificacao = undefined; 
        await usuario.save();

        res.status(200).json({ 
            mensagem: 'Conta verificada com sucesso!',
            usuario: usuario 
        });

    } catch (error) {
        res.status(500).json({ erro: 'Erro ao verificar código.' });
    }
});


// --- ROTA DE LOGIN ---
app.post('/api/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
       
        const usuarioEncontrado = await User.findOne({ email: email.toLowerCase() });

        if (!usuarioEncontrado) {
            return res.status(400).json({ erro: 'Usuário não localizado no sistema, verifique seu e-mail e tente novamente' });
        }

        // Compara a senha criptografada usando Bcrypt
        const senhaCorreta = await bcrypt.compare(senha, usuarioEncontrado.senha);
        if (!senhaCorreta) {
            return res.status(400).json({ erro: 'Senha incorreta' });
        }

        if (!usuarioEncontrado.isVerified) {
            return res.status(401).json({ erro: 'Acesso negado. Por favor, verifique seu e-mail com o código que enviamos no momento do cadastro.' });
        }

        // Gera token JWT assinado
        const token = jwt.sign(
            { id: usuarioEncontrado._id, email: usuarioEncontrado.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(200).json({
            mensagem: 'Login realizado com sucesso',
            usuario: {
                nome: usuarioEncontrado.nome,
                email: usuarioEncontrado.email,
                pontos: usuarioEncontrado.pontos,
                cupom: usuarioEncontrado.cupom
            },
            token
        });
    } catch (error) {
        console.error('Erro no login', error);
        res.status(500).json({ erro: 'Erro interno do servidor' });
    }
});


// --- ROTA ESQUECI SENHA ---
app.post('/api/esqueci-senha', async (req, res) => {
    try {
        const { email } = req.body;
        const usuario = await User.findOne({ email: email.toLowerCase() });

        if (!usuario) {
            return res.status(404).json({ erro: 'E-mail não localizado' });
        }

        const token = crypto.randomBytes(20).toString('hex');
        usuario.resetPasswordToken = token;
        usuario.resetPasswordExpires = Date.now() + 3600000; // +1 hora
        await usuario.save();

        const linkRecuperacao = `http://localhost:5173/redefinir-senha/${token}`;

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


// --- ROTA REDEFINIR SENHA ---
app.post('/api/redefinir-senha', async (req, res) => {
    try {
        const { token, novaSenha } = req.body;

        const usuario = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!usuario) {
            return res.status(400).json({ erro: 'O link de recuperação está incorreto ou expirou' });
        }

        // Criptografa a nova senha com Bcrypt
        usuario.senha = await bcrypt.hash(novaSenha, 10);
        usuario.resetPasswordToken = undefined;
        usuario.resetPasswordExpires = undefined;
        await usuario.save();

        res.status(200).json({ mensagem: 'Sua senha foi redefinida com sucesso!' });

    } catch (error) {
        res.status(500).json({ erro: 'Erro ao redefinir a senha.' });
    }
});


// --- ROTA DE ADICIONAR PONTOS (APENAS GERENTE) ---
app.put('/api/usuarios/pontos', autenticarToken, verificarGerente, async (req, res) => {
    try {
        const { email, pontosGanhos } = req.body;
        
        const usuarioAtualizado = await User.findOneAndUpdate(
            { email: email.toLowerCase() },
            { $inc: { pontos: pontosGanhos } }, 
            { new: true }
        );
        res.status(200).json({ mensagem: 'Pontos adicionados!', pontos: usuarioAtualizado.pontos });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao salvar pontos no banco' });
    }
});


// --- ROTA DE RESGATAR PONTOS (APENAS O PRÓPRIO USUÁRIO) ---
app.put('/api/usuarios/resgatar-pontos', autenticarToken, async (req, res) => {
    try {
        const { email, gasto, recompensaCodigo } = req.body;

        // Segurança extra: impede que um usuário gaste pontos de outro
        if (req.user.email !== email.toLowerCase()) {
            return res.status(403).json({ erro: 'Acesso negado. Você não pode resgatar pontos para outra conta.' });
        }

        const usuario = await User.findOne({ email: email.toLowerCase() });

        if (!usuario) {
            return res.status(404).json({ erro: 'Usuário não encontrado' });
        }

        if (usuario.pontos < gasto) {
            return res.status(400).json({ erro: 'Saldo insuficiente de pontos.' });
        }

        usuario.pontos -= gasto;

        if (recompensaCodigo) {
            usuario.cupom = recompensaCodigo;
        }

        await usuario.save();
        res.status(200).json({ mensagem: 'Recompensa resgatada!', pontosAtualizados: usuario.pontos });

    } catch (error) {
        res.status(500).json({ erro: 'Erro interno ao resgatar' });
    }
});


// --- ROTA INICIAL DE STATUS ---
app.get('/', (req, res) => {
    res.send('Servidor Anteiku está online e seguro');
});


// --- ROTA DE CRIAR PEDIDO (GUESTS OU CLIENTES AUTENTICADOS) ---
app.post('/api/pedidos', identificarToken, async (req, res) => {
    try {
        const { clienteNome, clienteEmail, itens, cupomDigitado } = req.body;

        let emailVerificado = clienteEmail;
        if (req.user) {
            emailVerificado = req.user.email; // Se logado, sobrepõe com email do token por segurança
        }

        const usuario = emailVerificado ? await User.findOne({ email: emailVerificado.toLowerCase() }) : null;

        let valorCalculadoPeloServidor = 0;
        let descontoAplicado = false;

        // Se veio array de itens, calcula o valor seguro do lado do servidor
        if (itens && Array.isArray(itens) && itens.length > 0) {
            itens.forEach((item) => {
                if (cupomDigitado && usuario && usuario.cupom === cupomDigitado && !descontoAplicado) {
                    const precoComDesconto = item.preco * 0.5;
                    const unidadesPrecoCheio = item.preco * (item.quantidade - 1);
                    valorCalculadoPeloServidor += precoComDesconto + unidadesPrecoCheio;
                    descontoAplicado = true;
                } else {
                    valorCalculadoPeloServidor += item.preco * item.quantidade;
                }
            });
        } else {
            // Fallback para pedidos rápidos/customizados de valor fixo direto
            valorCalculadoPeloServidor = Number(req.body.valor) || 0;
        }

        if (descontoAplicado && usuario && cupomDigitado) {
            usuario.cupom = ''; // Consome o cupom
            await usuario.save();
        }

        const novoPedido = new Pedido({
            clienteNome: clienteNome || (usuario ? usuario.nome : "Cliente Anônimo"),
            clienteEmail: emailVerificado || "anonimo@anteiku.com",
            valor: valorCalculadoPeloServidor,
            status: 'Pendente',
            itens: itens || [],
            data: new Date()
        });

        await novoPedido.save();
        res.status(201).json(novoPedido);

    } catch (error) {
        console.error(error);
        res.status(500).json({ erro: 'Erro ao registrar pedido com segurança' });
    }
});


// --- ROTA DE BUSCAR PEDIDOS PENDENTES (APENAS GERENTE) ---
app.get('/api/pedidos', autenticarToken, verificarGerente, async (req, res) => {
    try {
        const lista = await Pedido.find({ status: 'Pendente' }).sort({ data: -1 });
        res.json(lista);
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao buscar pedidos' });
    }
});


// --- ROTA DE ATUALIZAR STATUS DO PEDIDO (APENAS GERENTE) ---
app.put('/api/pedidos/:id/status', autenticarToken, verificarGerente, async (req, res) => {
    try {
        const pedidoId = req.params.id;
        const { status } = req.body;
        
        await Pedido.findByIdAndUpdate(pedidoId, { status: status });
        res.status(200).json({ mensagem: 'Status atualizado com sucesso' });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao atualizar status' });
    }
});


// --- ROTA DE UNIDADES DA CAFETERIA (MAPA) ---
app.get('/api/unidades', async (req, res) => {
    try {
        const listaUnidades = await Unidade.find(); 
        res.status(200).json(listaUnidades); 
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao buscar as unidades no banco.' });
    }
});


app.listen(PORT, () => {
    console.log(`Servidor seguro rodando na porta ${PORT}`);
});