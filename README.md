# TaxOne Painel Profissional

Projeto ajustado com uma interface mais profissional, responsiva e organizada para agendamentos, histórico, diagnóstico e monitoramento QAS/PRD.

## Como executar

```bash
npm install
cp .env.example .env
npm start
```

Acesse: `http://localhost:3000`

## O que foi melhorado

- Dashboard executivo com cards de resumo.
- Separação visual clara entre QAS e PRD.
- Histórico de execuções com filtros, badges e botão de limpeza.
- Tela de agendamentos com ações rápidas, ativar/desativar, executar agora e remover.
- Diagnóstico de ambiente com cards de HANA, TaxOne e teste HTTP.
- Visual responsivo para desktop, tablet e celular.
- Arquivos de frontend separados em `index.html`, `styles.css` e `app.js`.

## Observação

O backend original foi mantido em `server.js`. As melhorias foram aplicadas principalmente na camada visual em `/public`, usando as rotas já existentes da aplicação.

## Alterações v6
- Botão **Selecionar todos** e **Limpar seleção** nas listas com múltiplas opções.
- Para ICMS, IRRF, ISS, PCC e EFD-Sped, a seleção de múltiplas opções cria um agendamento por opção selecionada.
- Em recorrência mensal, o campo agora permite selecionar apenas **1º a 5º dia útil**.
