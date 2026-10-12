import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';

import { BarraCarregando } from '@/components/efeitos';
import { Botao, Campo, confirmar, Mensagem, Opcoes, Secao } from '@/components/formulario';
import { Cabecalho, Cartao } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { ehSindico } from '@/lib/acesso';
import { api, ApiError } from '@/lib/api';
import { tr } from '@/lib/idioma';
import { buscarMural, marcarMuralComoVisto, publicarAviso, quando, tirarAviso, type AvisoDoMural } from '@/lib/mural';
import { componentes, corpo, entrelinha, espaco, fontes, type Paleta } from '@/lib/tema';
import type { Condominio } from '@/lib/types';

/**
 * Mural de avisos: o que o síndico publicou para o condomínio. Todo mundo lê; o síndico
 * também escreve e tira avisos. Nada daqui vira notificação: aparece ao abrir o app.
 */
export default function MuralScreen() {
  const styles = useEstilos(criarEstilos);
  const { cores } = useTema();
  const { usuario } = useAuth();
  const sindico = ehSindico(usuario?.role);

  const [avisos, setAvisos] = useState<AvisoDoMural[] | null>(null);
  const [semMural, setSemMural] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // só o síndico: onde e o que publicar
  const [locais, setLocais] = useState<Condominio[]>([]);
  const [local, setLocal] = useState<number | null>(null);
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [publicando, setPublicando] = useState(false);
  const [erroDoAviso, setErroDoAviso] = useState<string | null>(null);
  const [tirando, setTirando] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    try {
      const lista = await buscarMural();
      setSemMural(lista === null);
      setAvisos(lista ?? []);
      setErro(null);
      if (lista) void marcarMuralComoVisto(lista);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : tr('Não foi possível carregar o mural. Puxe a tela para tentar de novo.'));
    }
  }, []);

  useEffect(() => {
    void carregar().finally(() => setCarregando(false));
  }, [carregar]);

  useEffect(() => {
    if (!sindico) return;
    let cancelado = false;
    api<Condominio[]>('/condominios?tipo=CONDOMINIO&ativo=true&limit=700')
      .then(lista => { if (!cancelado) { setLocais(lista); setLocal(atual => atual ?? lista[0]?.id ?? null); } })
      .catch(() => { /* sem a lista o formulário não aparece; o mural continua legível */ });
    return () => { cancelado = true; };
  }, [sindico]);

  const atualizar = useCallback(async () => {
    setAtualizando(true);
    await carregar();
    setAtualizando(false);
  }, [carregar]);

  const podePublicar = local !== null && titulo.trim().length > 0 && texto.trim().length > 0;

  async function publicar() {
    if (!podePublicar || local === null) return;
    setPublicando(true);
    setErroDoAviso(null);
    try {
      const novo = await publicarAviso(local, titulo.trim(), texto.trim());
      setAvisos(atuais => [novo, ...(atuais ?? [])]);
      void marcarMuralComoVisto([novo]);
      setTitulo('');
      setTexto('');
    } catch (e) {
      setErroDoAviso(e instanceof ApiError ? e.message : tr('Não foi possível publicar o aviso. Tente de novo.'));
    } finally {
      setPublicando(false);
    }
  }

  async function tirar(aviso: AvisoDoMural) {
    if (!(await confirmar(tr('Tirar este aviso do mural?'), tr('Os moradores deixam de ver "{0}".', [aviso.titulo]), tr('Tirar')))) return;
    setTirando(aviso.id);
    setErro(null);
    try {
      await tirarAviso(aviso.id);
      setAvisos(atuais => (atuais ?? []).filter(a => a.id !== aviso.id));
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : tr('Não foi possível tirar o aviso. Tente de novo.'));
    } finally {
      setTirando(null);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.tela}>
      <Cabecalho titulo={tr('Mural de avisos')} />
      <BarraCarregando ativa={carregando} />
      <ScrollView
        contentContainerStyle={styles.conteudo}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={cores.azul} />}
      >
        {erro && <Mensagem texto={erro} tom="erro" />}

        {semMural ? (
          <Mensagem texto={tr('O mural de avisos chega na próxima atualização do serviço. Por enquanto, os recados do condomínio continuam pelos canais de sempre.')} />
        ) : (
          <>
            {sindico && locais.length > 0 && (
              <Secao titulo={tr('Novo aviso')}>
                {locais.length > 1 && (
                  <Opcoes<number | null>
                    rotulo={tr('Para qual condomínio')}
                    valor={local}
                    opcoes={locais.map(l => ({ valor: l.id, rotulo: l.nome }))}
                    onChange={setLocal}
                  />
                )}
                <Campo rotulo={tr('Título')} value={titulo} onChangeText={setTitulo} maxLength={120} placeholder={tr('Ex.: Portão em manutenção')} />
                <Campo
                  rotulo={tr('Aviso')} value={texto} onChangeText={setTexto} maxLength={2000} multiline
                  placeholder={tr('Ex.: Na quinta, das 9h às 12h, a entrada é só pela portaria.')}
                  ajuda={tr('Todos os moradores deste condomínio veem o aviso ao abrir o aplicativo.')}
                />
                {erroDoAviso && <Mensagem texto={erroDoAviso} tom="erro" />}
                <Botao titulo={tr('Publicar no mural')} onPress={() => { void publicar(); }} carregando={publicando} desabilitado={!podePublicar} />
              </Secao>
            )}

            {!carregando && avisos !== null && avisos.length === 0 && !erro && (
              <Mensagem texto={sindico ? tr('Nenhum aviso no mural. O que você publicar aparece aqui e para os moradores.') : tr('Nenhum aviso do condomínio por enquanto.')} />
            )}

            {(avisos ?? []).map(a => (
              <Cartao key={a.id} style={styles.aviso}>
                <Text style={styles.titulo} accessibilityRole="header">{a.titulo}</Text>
                <Text style={styles.meta}>
                  {[a.condominio_nome, a.autor_nome, quando(a.criado_em)].filter(Boolean).join(' · ')}
                </Text>
                <Text style={styles.texto}>{a.texto}</Text>
                {a.pode_apagar && (
                  <Botao titulo={tr('Tirar do mural')} variante="perigo" onPress={() => { void tirar(a); }} carregando={tirando === a.id} desabilitado={tirando !== null} />
                )}
              </Cartao>
            ))}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { width: '100%', maxWidth: componentes.conteudo.larguraMaxima, alignSelf: 'center', padding: espaco[4], paddingBottom: espaco[10], gap: espaco[5] },
  aviso: { gap: espaco[2.5] },
  titulo: { fontFamily: fontes.nome, fontSize: corpo.nomeGrande, lineHeight: entrelinha.titulo, color: c.texto },
  meta: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.textoSuave },
  texto: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.texto },
});
