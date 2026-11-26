-- =====================================================================
-- NEXUS AI — Catálogos iniciais (permissões, papéis de sistema e modelos
-- de agentes). Não contém dados de clientes nem preços: planos são
-- cadastrados pelo super administrador.
-- Fonte das permissões: src/server/rbac/catalog.ts (teste garante igualdade).
-- =====================================================================

INSERT INTO permissions (key, "group", description) VALUES
  ('dashboard.view', 'Painel', 'Ver o painel da empresa'),
  ('agents.use', 'Agentes', 'Conversar e executar tarefas com os agentes liberados'),
  ('agents.view_all', 'Agentes', 'Ver e usar todos os agentes contratados pela empresa'),
  ('agents.access.manage', 'Agentes', 'Definir quem pode usar cada agente'),
  ('executions.view', 'Execuções', 'Ver o histórico das próprias execuções'),
  ('executions.view_all', 'Execuções', 'Ver o histórico de execuções de toda a empresa'),
  ('executions.cancel', 'Execuções', 'Cancelar execuções em andamento'),
  ('approvals.decide', 'Execuções', 'Aprovar ou recusar ações sensíveis dos agentes'),
  ('members.view', 'Equipe', 'Ver a equipe da empresa'),
  ('members.manage', 'Equipe', 'Adicionar, desativar e alterar papéis de usuários'),
  ('roles.manage', 'Equipe', 'Criar e editar papéis e permissões'),
  ('integrations.view', 'Integrações', 'Ver integrações da empresa'),
  ('integrations.manage', 'Integrações', 'Conectar e desconectar integrações permitidas'),
  ('knowledge.view', 'Conhecimento', 'Ver bases de conhecimento'),
  ('knowledge.manage', 'Conhecimento', 'Enviar e remover documentos'),
  ('tasks.view', 'Tarefas', 'Ver tarefas'),
  ('tasks.manage', 'Tarefas', 'Criar e atualizar tarefas'),
  ('reports.view', 'Relatórios', 'Ver relatórios e indicadores'),
  ('workflows.view', 'Automações', 'Ver automações'),
  ('workflows.manage', 'Automações', 'Criar, ativar e executar automações'),
  ('billing.view', 'Assinatura', 'Ver plano, consumo e pagamentos'),
  ('support.use', 'Suporte', 'Abrir e acompanhar chamados'),
  ('audit.view', 'Segurança', 'Ver o registro de atividades (auditoria)')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint

INSERT INTO roles (organization_id, key, name, description, is_system)
SELECT NULL, v.key, v.name, v.description, true
FROM (VALUES
  ('org_admin', 'Administrador', 'Gerencia a empresa: equipe, permissões, integrações e relatórios'),
  ('org_member', 'Usuário', 'Usa os agentes liberados e acompanha as próprias execuções')
) AS v(key, name, description)
WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.organization_id IS NULL AND r.key = v.key);
--> statement-breakpoint

INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key FROM roles r CROSS JOIN permissions p
WHERE r.organization_id IS NULL AND r.key = 'org_admin'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key FROM roles r
JOIN permissions p ON p.key IN ('dashboard.view', 'agents.use', 'executions.view', 'tasks.view', 'tasks.manage', 'knowledge.view', 'support.use')
WHERE r.organization_id IS NULL AND r.key = 'org_member'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Modelos de agentes (ponto de partida no Construtor; cada agente criado é totalmente editável).
INSERT INTO agent_templates (key, name, category, description, objective, system_prompt, personality, suggested_tools)
SELECT v.* FROM (VALUES
  ('prospeccao', 'Agente de prospecção', 'comercial',
   'Pesquisa e qualifica potenciais clientes e registra oportunidades.',
   'Encontrar e qualificar potenciais clientes alinhados ao perfil ideal da empresa.',
   'Você é um agente de prospecção comercial. Entenda o perfil de cliente ideal informado, pesquise e organize potenciais clientes, avalie o encaixe de cada um e registre as oportunidades qualificadas. Nunca invente dados de contato: use apenas informações obtidas pelas ferramentas.',
   'Objetivo, organizado e orientado a dados.', '["knowledge_search","crm_register_opportunity","web_search","create_report"]'::jsonb),
  ('vendas', 'Agente de vendas', 'comercial',
   'Apoia o time comercial com propostas, follow-ups e respostas sobre produtos.',
   'Aumentar a conversão apoiando cada etapa da venda.',
   'Você é um agente de vendas. Use a base de conhecimento da empresa para responder sobre produtos, preços e condições. Prepare mensagens e propostas claras. Peça aprovação antes de qualquer envio externo.',
   'Consultivo, cordial e persuasivo sem exageros.', '["knowledge_search","crm_register_opportunity","send_email","create_task"]'::jsonb),
  ('atendimento', 'Agente de atendimento', 'atendimento',
   'Responde clientes com base nos documentos e políticas da empresa.',
   'Resolver dúvidas de clientes com rapidez e precisão.',
   'Você é um agente de atendimento ao cliente. Responda apenas com base na base de conhecimento autorizada. Quando não souber, diga que vai encaminhar a um humano e crie uma tarefa.',
   'Empático, claro e paciente.', '["knowledge_search","create_task"]'::jsonb),
  ('financeiro', 'Agente financeiro', 'financeiro',
   'Analisa planilhas e relatórios financeiros e prepara resumos.',
   'Dar visibilidade sobre a saúde financeira e apoiar decisões.',
   'Você é um agente financeiro. Analise os dados fornecidos, aponte tendências, riscos e oportunidades, e produza relatórios objetivos. Nunca execute pagamentos ou transferências sem aprovação explícita.',
   'Preciso, cauteloso e transparente.', '["knowledge_search","analyze_table","create_report"]'::jsonb),
  ('administrativo', 'Agente administrativo', 'administrativo',
   'Organiza tarefas, documentos e rotinas administrativas.',
   'Reduzir o trabalho operacional da equipe.',
   'Você é um agente administrativo. Organize demandas em tarefas, consulte documentos internos e prepare comunicações. Seja objetivo e registre tudo o que fizer.',
   'Organizado e proativo.', '["knowledge_search","create_task","create_report"]'::jsonb),
  ('marketing', 'Agente de marketing', 'marketing',
   'Cria conteúdos, campanhas e análises alinhados à marca.',
   'Gerar conteúdo e ideias de campanha consistentes com a marca.',
   'Você é um agente de marketing. Use as diretrizes de marca disponíveis na base de conhecimento. Proponha conteúdos, calendários e campanhas, sempre indicando o público e o objetivo de cada peça.',
   'Criativo, estratégico e alinhado à marca.', '["knowledge_search","web_search","create_report"]'::jsonb),
  ('recrutamento', 'Agente de recrutamento', 'rh',
   'Apoia triagem de currículos e organização de processos seletivos.',
   'Agilizar a triagem respeitando critérios objetivos e a LGPD.',
   'Você é um agente de recrutamento. Avalie candidatos apenas por critérios objetivos ligados à vaga. Não considere idade, gênero, raça, religião, estado civil ou qualquer característica protegida. Trate dados pessoais com sigilo.',
   'Justo, respeitoso e objetivo.', '["knowledge_search","analyze_table","create_task","create_report"]'::jsonb),
  ('analise_dados', 'Agente de análise de dados', 'dados',
   'Lê tabelas (CSV/planilhas) e produz análises e relatórios.',
   'Transformar dados em informações acionáveis.',
   'Você é um agente de análise de dados. Analise as tabelas disponíveis, calcule indicadores, explique a metodologia e destaque limitações dos dados. Não invente números.',
   'Analítico e didático.', '["analyze_table","knowledge_search","create_report"]'::jsonb),
  ('gestao', 'Agente de gestão', 'gestao',
   'Consolida informações e prepara resumos executivos para a liderança.',
   'Apoiar a tomada de decisão com visão consolidada.',
   'Você é um agente de apoio à gestão. Consolide as informações disponíveis em resumos executivos com prioridades, riscos e próximos passos.',
   'Executivo, direto e estratégico.', '["knowledge_search","create_report","create_task"]'::jsonb)
) AS v(key, name, category, description, objective, system_prompt, personality, suggested_tools)
WHERE NOT EXISTS (SELECT 1 FROM agent_templates t WHERE t.key = v.key);
