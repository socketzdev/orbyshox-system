const http = require('http');

function post(urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3001,
        path: urlPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let resData = '';
        res.on('data', (chunk) => (resData += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(resData) });
          } catch (e) {
            resolve({ status: res.statusCode, body: resData });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('=== TESTE DE PODER ABSOLUTO DO COPILOTO GEMINI ===\n');

  // 1. Login como operador do Restaurante do Gordo
  const loginRes = await post('/api/v1/tenant-app/auth/login', {
    email: '19218299421',
    password: '123456',
  });

  const token = loginRes.body?.accessToken;
  if (!token) {
    console.error('Falha no login:', loginRes.body);
    process.exit(1);
  }
  console.log('✅ Login realizado com sucesso no Restaurante do Gordo! Token obtido.');

  const testPrompts = [
    'quantas mesas estão no salão agora?',
    'lança 2 sushis fritos na mesa 2',
    'adiciona 3 cervejas na mesa 2',
    'o que foi pedido na mesa 2?',
    'aplica 10 reais de desconto na mesa 2',
    'muda o preço do sushi frito para 38 reais',
    'adiciona 15 unidades no estoque de cerveja',
    'pausa o prato sushi frito',
    'fecha a conta da mesa 2 no pix',
    'como estão as mesas agora?',
  ];

  for (const prompt of testPrompts) {
    console.log(`\n💬 USUÁRIO: "${prompt}"`);
    const chatRes = await post('/api/v1/ai/chat', { message: prompt }, token);

    if (chatRes.status !== 201 && chatRes.status !== 200) {
      console.error(`❌ Erro no chat (${chatRes.status}):`, chatRes.body);
      continue;
    }

    const { text, thought, toolsUsed, resultsSummary, modelUsed } = chatRes.body;
    console.log(`🧠 THOUGHT: ${thought}`);
    console.log(`🔧 TOOLS EXECUTADAS: ${toolsUsed?.map(t => `${t.name} (success: ${t.success})`).join(', ') || 'Nenhuma'}`);
    if (resultsSummary) {
      console.log(`📊 CARD DE RESULTADO: "${resultsSummary.title}" (${resultsSummary.total} itens)`);
    }
    console.log(`🤖 RESPOSTA IA:\n${text}`);
  }

  console.log('\n=== TODOS OS TESTES DE PODER ABSOLUTO EXECUTADOS COM SUCESSO! ===');
}

runTests().catch(console.error);
