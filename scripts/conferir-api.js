/**
 * Confere se uma API responde como o aplicativo dos moradores espera
 * (contrato: ../CONTRATO-API-APP-MORADORES.md, na pasta "Sistemas Cmport").
 *
 * Só LÊ: faz login e pedidos GET. Não cria, não altera e não apaga nada.
 * (A única exceção é o próprio login, que é um POST.)
 *
 * Como usar, no terminal, dentro de cmport-app:
 *
 *   PowerShell:
 *     $env:CMPORT_API = 'https://endereco-da-api-nova/api/v1'
 *     $env:CMPORT_EMAIL = 'morador.de.teste@exemplo.com'
 *     $env:CMPORT_SENHA = '...'
 *     node scripts/conferir-api.js
 *
 * ATENÇÃO: o serviço prende cada conta ao PRIMEIRO aparelho que entrar. Este roteiro se apresenta
 * com o identificador de CMPORT_APARELHO. Se a conta ainda não entrou em nenhum aparelho, rodar
 * isto a prende a esse identificador, e o app de verdade passa a ser recusado (403) até a CM Port
 * liberar a troca. Use só com uma conta já presa ao identificador que você informar.
 *
 *     $env:CMPORT_APARELHO = '<o X-Aparelho-Id do aparelho em que a conta já entrou>'
 *
 * Rode uma vez com um MORADOR e outra com um SÍNDICO: o que cada um pode é diferente,
 * e o roteiro confere as duas coisas (o que precisa funcionar e o que precisa ser recusado).
 * A senha fica só na variável do terminal; o roteiro não a grava nem a mostra.
 */
const API = (process.env.CMPORT_API || '').replace(/\/+$/, '');
const EMAIL = process.env.CMPORT_EMAIL || '';
const SENHA = process.env.CMPORT_SENHA || '';
const APARELHO = process.env.CMPORT_APARELHO || '';

if (!API || !EMAIL || !SENHA || !APARELHO) {
  console.log('Faltam as variáveis CMPORT_API, CMPORT_EMAIL, CMPORT_SENHA e CMPORT_APARELHO. Veja o começo deste arquivo,\nprincipalmente o aviso sobre o aparelho: o primeiro login prende a conta.');
  process.exit(2);
}

const linhas = [];
const anotar = (situacao, rota, detalhe = '') => linhas.push({ situacao, rota: rota.replace(/\?de=.*$/, ''), detalhe });
let token = null;

async function pedir(metodo, caminho, corpo) {
  const cabecalhos = { Accept: 'application/json', 'X-Aparelho-Id': APARELHO, 'X-Aparelho-Nome': 'roteiro conferir-api' };
  if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
  if (token) cabecalhos.Authorization = `Bearer ${token}`;
  try {
    const r = await fetch(API + caminho, { method: metodo, headers: cabecalhos, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
    const json = r.status === 204 ? null : await r.json().catch(() => null);
    return { status: r.status, json, cabecalhos: r.headers };
  } catch (e) {
    return { status: 0, json: null, erro: String(e.cause?.code || e.message) };
  }
}

/** Chaves que o app lê e que precisam existir na resposta (mesmo nulas). */
const faltando = (objeto, chaves) => (objeto && typeof objeto === 'object' ? chaves.filter(c => !(c in objeto)) : chaves);

/** Um pedido que precisa dar certo e trazer certas chaves. Devolve o corpo, ou null. */
async function deveResponder(rota, chaves, { lista = false, opcional = false } = {}) {
  const r = await pedir('GET', rota);
  if (r.status === 0) { anotar('FALHOU', `GET ${rota}`, `sem resposta (${r.erro})`); return null; }
  if (r.status !== 200) { anotar(opcional ? 'AVISO' : 'FALHOU', `GET ${rota}`, `respondeu ${r.status}${r.json?.detail ? `: ${String(r.json.detail).slice(0, 80)}` : ''}`); return null; }
  if (lista && !Array.isArray(r.json)) { anotar('FALHOU', `GET ${rota}`, 'era para ser uma lista'); return null; }
  const amostra = lista ? r.json[0] : r.json;
  if (lista && r.json.length === 0) { anotar('OK', `GET ${rota}`, 'lista vazia: os campos não puderam ser conferidos'); return r.json; }
  const falta = faltando(amostra, chaves);
  if (falta.length) anotar('DIFERENTE', `GET ${rota}`, `faltam os campos: ${falta.join(', ')}`);
  else anotar('OK', `GET ${rota}`, lista ? `${r.json.length} ${r.json.length === 1 ? 'item' : 'itens'}` : '');
  return r.json;
}

/** Um pedido que o servidor precisa RECUSAR para este nível. */
async function deveRecusar(rota, motivo) {
  const r = await pedir('GET', rota);
  if (r.status === 403 || r.status === 404) anotar('OK', `GET ${rota}`, `recusado (${r.status}), como deve ser: ${motivo}`);
  else if (r.status === 200) anotar('INSEGURO', `GET ${rota}`, `respondeu 200, mas deveria recusar: ${motivo}`);
  else anotar('AVISO', `GET ${rota}`, `respondeu ${r.status}; o esperado era 403 ou 404 (${motivo})`);
}

const CAMERA = ['id', 'condominio_id', 'condominio_nome', 'poste_id', 'poste_nome', 'nome', 'tipo_conexao', 'ativo', 'online', 'saude', 'miniatura_url', 'dias_retencao', 'rtmp_stream_key', 'rtmp_url', 'nvr_ip', 'nvr_usuario'];
const POSTE = ['id', 'condominio_id', 'condominio_nome', 'nome', 'observacao', 'ativo', 'total_cameras'];
const utc = d => d.toISOString().slice(0, 19);

(async () => {
  console.log(`\nConferindo ${API}\n`);

  // ── entrar ──
  const login = await pedir('POST', '/auth/login', { email: EMAIL.trim().toLowerCase(), senha: SENHA });
  if (login.status !== 200) {
    const motivo = login.status === 0 ? `sem resposta (${login.erro})` : `respondeu ${login.status}${login.json?.detail ? `: ${login.json.detail}` : ''}`;
    console.log(`Não consegui entrar: ${motivo}.\nSem login não dá para conferir o resto.`);
    process.exit(1);
  }
  const faltaLogin = faltando(login.json, ['access_token', 'token_type', 'role', 'nome']);
  anotar(faltaLogin.length ? 'DIFERENTE' : 'OK', 'POST /auth/login', faltaLogin.length ? `faltam os campos: ${faltaLogin.join(', ')}` : `entrou como ${login.json.role}`);
  token = login.json.access_token;
  const nivel = login.json.role;
  const morador = nivel === 'MORADOR';
  const sindico = nivel === 'SINDICO';
  if (!morador && !sindico) anotar('AVISO', 'nível do login', `${nivel}: este aplicativo é para MORADOR e SINDICO; a recomendação é a API recusar os outros níveis aqui`);

  // ── conta ──
  const eu = await deveResponder('/auth/me', ['id', 'nome', 'email', 'role']);
  if (eu) {
    const faltaPerfil = faltando(eu, ['cpf_mascarado', 'telefone', 'locais']);
    anotar(faltaPerfil.length ? 'DIFERENTE' : 'OK', 'GET /auth/me (perfil)', faltaPerfil.length ? `faltam: ${faltaPerfil.join(', ')} (o CPF mascarado vai na marca d'água)` : '');
  }
  const foto = await pedir('GET', '/auth/me/foto');
  if (foto.status === 200) anotar(faltando(foto.json, ['imagem_base64', 'tipo']).length ? 'DIFERENTE' : 'OK', 'GET /auth/me/foto', 'tem foto');
  else if (foto.status === 404) anotar('AVISO', 'GET /auth/me/foto', '404: ou a pessoa não tem foto (certo), ou a rota não existe; confira enviando uma foto pelo app');
  else anotar('FALHOU', 'GET /auth/me/foto', `respondeu ${foto.status}`);
  const renovar = await pedir('POST', '/auth/renovar');
  if (renovar.status === 200 && renovar.json?.access_token) { anotar('OK', 'POST /auth/renovar'); token = renovar.json.access_token; }
  else anotar('FALHOU', 'POST /auth/renovar', `respondeu ${renovar.status}: o app não consegue estender a sessão`);

  // ── listas ──
  const condominios = await deveResponder('/condominios?tipo=CONDOMINIO&ativo=true&limit=700', ['id', 'nome'], { lista: true });
  const postes = await deveResponder('/postes', POSTE, { lista: true });
  const cameras = await deveResponder('/cameras', CAMERA, { lista: true });
  if (sindico && condominios && condominios.length > 1) anotar('AVISO', 'GET /condominios', `o síndico recebeu ${condominios.length} condomínios; o contrato supõe um só`);
  if (cameras && cameras.length) {
    const expostas = cameras.filter(c => c.rtmp_stream_key || c.rtmp_url || c.nvr_ip || c.nvr_usuario);
    if (expostas.length) anotar('INSEGURO', 'GET /cameras', `${expostas.length} câmera(s) vieram com a chave RTMP ou os dados do gravador; para este app devem vir sempre nulos`);
    else anotar('OK', 'GET /cameras (credenciais)', 'chave RTMP e dados do gravador vêm nulos');
    const inativas = cameras.filter(c => c.ativo === false).length;
    if (inativas) anotar('AVISO', 'GET /cameras', `${inativas} câmera(s) desativada(s) na lista; o contrato pede só as ativas`);
  }
  if (condominios && condominios[0]) await deveResponder(`/cameras/por-condominio/${condominios[0].id}`, CAMERA, { lista: true });
  if (postes && postes[0]) {
    await deveResponder(`/postes/${postes[0].id}`, POSTE);
    await deveResponder(`/postes?condominio_id=${postes[0].condominio_id}`, POSTE, { lista: true });
    await deveResponder(`/cameras/por-poste/${postes[0].id}`, CAMERA, { lista: true });
  }

  // ── uma câmera: detalhe, saúde, gravações ──
  const camera = cameras && cameras[0];
  if (!camera) {
    anotar('AVISO', 'câmeras', 'este login não vê nenhuma câmera: ao vivo, saúde e gravações não foram conferidos');
  } else {
    await deveResponder(`/cameras/${camera.id}`, CAMERA);
    await deveResponder(`/cameras/${camera.id}/saude`, ['camera_id', 'status', 'itens'], { opcional: true });
    const ate = new Date(); const de = new Date(ate.getTime() - 60 * 60 * 1000);
    const rotaGravacoes = `/cameras/${camera.id}/gravacoes?de=${utc(de)}&ate=${utc(ate)}`;
    if (morador) {
      await deveRecusar(rotaGravacoes, 'morador não puxa gravação');
    } else {
      const linha = await deveResponder(rotaGravacoes, ['segmentos']);
      const trecho = linha && Array.isArray(linha.segmentos) && linha.segmentos[0];
      if (trecho) {
        const falta = faltando(trecho, ['id', 'inicio', 'fim', 'tem_movimento']);
        anotar(falta.length ? 'DIFERENTE' : 'OK', 'gravações (campos do trecho)', falta.length ? `faltam: ${falta.join(', ')}` : `${linha.segmentos.length} trechos na última hora`);
      } else if (linha) anotar('AVISO', 'gravações', 'nenhum trecho na última hora: os campos do trecho e o link de vídeo não foram conferidos');
    }
    anotar('AVISO', `POST /cameras/${camera.id}/webrtc`, 'ao vivo não é conferido por este roteiro: abra a câmera no app');
  }

  // ── moradores (só o síndico) ──
  if (morador) {
    await deveRecusar('/usuarios', 'morador não gerencia usuários');
  } else if (sindico) {
    const sonda = await pedir('GET', '/usuarios');
    const usuarios = sonda.status === 404 || sonda.status === 405
      ? (anotar('AVISO', 'GET /usuarios', `respondeu ${sonda.status}: a gestão de moradores ainda não está no ar (próxima etapa)`), null)
      : await deveResponder('/usuarios', ['id', 'nome', 'email', 'role', 'ativo', 'so_um_aparelho', 'aparelho_nome', 'aparelho_em'], { lista: true });
    if (usuarios) {
      const outros = usuarios.filter(u => u.role !== 'MORADOR');
      if (outros.length) anotar('INSEGURO', 'GET /usuarios', `o síndico recebeu ${outros.length} usuário(s) que não são moradores (${[...new Set(outros.map(u => u.role))].join(', ')})`);
      else anotar('OK', 'GET /usuarios (filtro)', 'só moradores na lista');
      if (usuarios[0]) await deveResponder(`/usuarios/${usuarios[0].id}/acessos`, ['poste_ids', 'camera_ids']);
    }
  }

  // ── resultado ──
  const ordem = { INSEGURO: 0, FALHOU: 1, DIFERENTE: 2, AVISO: 3, OK: 4 };
  linhas.sort((a, b) => ordem[a.situacao] - ordem[b.situacao]);
  const largura = Math.max(...linhas.map(l => l.rota.length));
  for (const l of linhas) console.log(`${l.situacao.padEnd(9)} ${l.rota.padEnd(largura)}  ${l.detalhe}`);
  const conta = s => linhas.filter(l => l.situacao === s).length;
  console.log(`\n${conta('OK')} certos, ${conta('DIFERENTE')} diferentes do contrato, ${conta('FALHOU')} falharam, ${conta('INSEGURO')} inseguros, ${conta('AVISO')} avisos.`);
  console.log('Não conferido por este roteiro: ao vivo, tocar e baixar gravação, e tudo que altera dados (perfil, foto, senha, criar morador, liberar câmeras).');
  process.exitCode = conta('INSEGURO') + conta('FALHOU') > 0 ? 1 : 0;
})();
