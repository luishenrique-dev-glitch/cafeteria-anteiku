# Anteiku

Requer Node.js 24 ou superior. Não precisa instalar dependências.

No terminal desta pasta, execute `node server.js` e acesse http://localhost:3000.
Mantenha o terminal aberto. Para parar, pressione Ctrl+C.
Também é possível usar `npm run dev` para reiniciar ao editar o servidor.

O servidor funciona localmente. Abra o endereço acima, em vez de abrir index.html diretamente ou usar Live Server.
Os cadastros e sessões ficam em data/cafeteria.sqlite. Senhas são armazenadas como hashes scrypt com salt; sessões duram um dia.

O fluxo permite criar conta, entrar e sair. O servidor calcula 14% de desconto na primeira compra sobre o subtotal, arredondado para centavos. O pedido recebe um código enviado pelo WhatsApp. Enviar uma mensagem não confirma uma compra.

Após conferir o pedido e confirmar a compra, a cafeteria executa no terminal: `node confirmar-pedido.cjs CODIGO_DO_PEDIDO`. Use o código presente na mensagem do WhatsApp. Isso registra a compra e impede novo desconto nessa conta. Pedidos pendentes antigos com desconto serão recusados após uma compra confirmada; o cliente deve gerar um novo pedido. Não confirme pedidos de teste no banco real.

O controle é por conta. Como os e-mails ainda não são verificados, ele não impede que uma pessoa crie várias contas. Preços oficiais ficam em orders.cjs; mantenha os preços do cardápio no index.html sincronizados com eles.
E-mails não são verificados e ainda não existe recuperação de senha. Antes de disponibilizar na internet, configure HTTPS, cookies Secure, verificação de e-mail e confirmação administrativa das compras.
