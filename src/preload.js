const { contextBridge, ipcRenderer } = require('electron')

// Helper: registra listener e retorna função de cleanup para evitar acúmulo
function onEvent (channel, fn) {
  const handler = (_, ...args) => fn(...args)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('api', {
  // WhatsApp
  waStatus:       ()        => ipcRenderer.invoke('wa:status'),
  onWaQr:         (fn)      => onEvent('wa:qr', fn),
  onWaStatus:     (fn)      => onEvent('wa:status', fn),
  removeWaQrListeners:  ()  => ipcRenderer.removeAllListeners('wa:qr'),
  removeWaStatusListeners: () => ipcRenderer.removeAllListeners('wa:status'),

  // Clientes
  listarClientes: ()        => ipcRenderer.invoke('clientes:listar'),
  salvarClientes: (lista)   => ipcRenderer.invoke('clientes:salvar', lista),

  // Config
  lerConfig:      ()        => ipcRenderer.invoke('config:ler'),
  salvarConfig:   (cfg)     => ipcRenderer.invoke('config:salvar', cfg),

  // Logs
  lerLog:         ()        => ipcRenderer.invoke('log:ler'),
  onNovaLog:      (fn)      => onEvent('log:nova', fn),

  // Disparos
  testarCliente:  (nome)    => ipcRenderer.invoke('disparo:testar', nome),
  rodarDisparo:   ()        => ipcRenderer.invoke('disparo:rodar'),
  onDisparoConcluido: (fn)  => onEvent('disparo:concluido', fn),

  // Mensagens livres e agendadas
  enviarLivre:        (dados) => ipcRenderer.invoke('mensagem:enviar-livre', dados),
  agendarMensagem:    (dados) => ipcRenderer.invoke('mensagem:agendar', dados),
  listarAgendadas:    ()      => ipcRenderer.invoke('mensagem:listar-agendadas'),
  cancelarAgendada:   (id)    => ipcRenderer.invoke('mensagem:cancelar-agendada', id),
  onAgendadosAtualizado: (fn) => onEvent('agendados:atualizado', fn),

  // Serviço
  pausarServico:    ()   => ipcRenderer.invoke('servico:pausar'),
  reativarServico:  ()   => ipcRenderer.invoke('servico:reativar'),
  statusServico:    ()   => ipcRenderer.invoke('servico:status'),
  onServicoStatus:  (fn) => onEvent('servico:status', fn),
  desinstalar:      ()   => ipcRenderer.invoke('servico:desinstalar'),
})
