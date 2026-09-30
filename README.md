# JVM Engenharia & Treinamento

Site institucional estático com páginas independentes para início, sobre nós, serviços, cursos e contato, além de backend Node.js opcional para a API de contato. Em execução local ou em contêiner, o Node.js serve o site e a API. O GitHub Pages publica apenas o site estático.

## Requisitos

- Node.js 20 ou superior (Node 22 recomendado).
- Uma conta no [Resend](https://resend.com/) para envio das mensagens.
- Um domínio verificado no Resend para configurar o remetente.

## Executar localmente

1. Copie `server/.env.example` para `server/.env`.
2. Substitua `RESEND_API_KEY` pela chave da conta Resend.
3. Em `MAIL_FROM`, configure um remetente de um domínio verificado no Resend, por exemplo `JVM Engenharia <site@seudominio.com.br>`.
4. Confirme `MAIL_TO` como `joao.nunes@jvmengenharia.com.br` ou altere para o endereço confirmado pela empresa.
5. Mantenha `ALLOWED_ORIGINS=http://localhost:3000` e `TRUST_PROXY=false` para execução local.
6. Na raiz do projeto, execute `npm start` e acesse `http://localhost:3000`.

Não publique nem envie o arquivo `server/.env`. Em produção, cadastre os mesmos valores no gerenciador de segredos da hospedagem.

## Como o formulário funciona

O navegador envia uma requisição JSON para `POST /api/contact`. O backend valida os campos, limita o tamanho e a frequência das requisições, verifica a origem, descarta envios que preencham o campo anti-spam e encaminha a mensagem como texto simples pela API do Resend. O endereço do visitante é usado como `Reply-To`; as credenciais do provedor nunca são enviadas ao navegador.

O endpoint `GET /api/health` informa se o processo está ativo e se as variáveis de envio foram configuradas, sem expor valores secretos.

## Publicar

O `Dockerfile` prepara o site e a API para hospedagem em um serviço que aceite contêineres. Configure as variáveis `MAIL_TO`, `MAIL_FROM`, `RESEND_API_KEY`, `ALLOWED_ORIGINS` e `PORT` na plataforma. `ALLOWED_ORIGINS` deve conter a origem pública exata do site, como `https://www.seudominio.com.br`.

### GitHub Pages

O workflow `.github/workflows/pages.yml` publica automaticamente a versão atual quando há alterações em `main`. O repositório usa **GitHub Actions** como origem de publicação. A versão atual fica em `https://devfabiomart7.github.io/JVM-Engenharia/`; a versão anterior, preservada para comparação, fica em `https://devfabiomart7.github.io/JVM-Engenharia/preview/`. O Pages publica HTML, CSS, JavaScript e imagens; ele não executa o backend Node.

Por isso, o formulário avisa que ainda precisa de um backend quando aberto no domínio `github.io`. Quando a API Node estiver hospedada separadamente, preencha `window.JVM_CONTACT_API_URL` em `js/config.js` com sua origem HTTPS, sem `/api/contact`, e inclua `https://devfabiomart7.github.io` em `ALLOWED_ORIGINS` no backend.

Use HTTPS na hospedagem. Deixe `TRUST_PROXY=false`, a menos que a plataforma use um proxy reverso confiável e sobrescreva os cabeçalhos `X-Forwarded-For` e `X-Forwarded-Proto`; só então habilite-o para que o limite de requisições identifique o IP real do visitante.

O limite de cinco envios por dez minutos é mantido em memória e reinicia quando o processo reinicia. Para hospedagem com várias instâncias, substitua esse armazenamento por um limitador compartilhado (por exemplo, Redis) antes de escalar horizontalmente.

## Pendências para ativar o formulário

- Criar ou acessar a conta Resend da JVM e verificar um domínio/remetente.
- Hospedar o backend Node.js separadamente do GitHub Pages e configurar `MAIL_TO`, `MAIL_FROM`, `RESEND_API_KEY`, `ALLOWED_ORIGINS` e `PORT` como variáveis de ambiente.
- Preencher `window.JVM_CONTACT_API_URL` em `js/config.js` com a origem HTTPS do backend.
- Confirmar o endereço destinatário que receberá os contatos.
- Revisar e publicar o aviso de privacidade da JVM antes de receber dados de clientes.

O site estático já está publicado no GitHub Pages. Sem o backend e as credenciais do Resend, o formulário não consegue enviar mensagens. Um domínio próprio é opcional.
