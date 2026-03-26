const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // WhatsApp
  waStatus:       ()        => ipcRenderer.invoke('wa:status'),
  onWaQr:         (fn)      => ipcRenderer.on('wa:qr', (_, qr) => fn(qr)),
  onWaStatus:     (fn)      => ipcRenderer.on('wa:status', (_, s) => fn(s)),
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
  onNovaLog:      (fn)      => ipcRenderer.on('log:nova', (_, l) => fn(l)),

  // Disparos
  testarCliente:  (nome)    => ipcRenderer.invoke('disparo:testar', nome),
  rodarDisparo:   ()        => ipcRenderer.invoke('disparo:rodar'),
  onDisparoConcluido: (fn)  => ipcRenderer.on('disparo:concluido', (_, d) => fn(d)),

  // Mensagens livres e agendadas
  enviarLivre:        (dados) => ipcRenderer.invoke('mensagem:enviar-livre', dados),
  agendarMensagem:    (dados) => ipcRenderer.invoke('mensagem:agendar', dados),
  listarAgendadas:    ()      => ipcRenderer.invoke('mensagem:listar-agendadas'),
  cancelarAgendada:   (id)    => ipcRenderer.invoke('mensagem:cancelar-agendada', id),
  onAgendadosAtualizado: (fn) => ipcRenderer.on('agendados:atualizado', (_, l) => fn(l)),

  // Serviço
  pausarServico:    ()   => ipcRenderer.invoke('servico:pausar'),
  reativarServico:  ()   => ipcRenderer.invoke('servico:reativar'),
  statusServico:    ()   => ipcRenderer.invoke('servico:status'),
  onServicoStatus:  (fn) => ipcRenderer.on('servico:status', (_, p) => fn(p)),
  desinstalar:      ()   => ipcRenderer.invoke('servico:desinstalar'),
})
