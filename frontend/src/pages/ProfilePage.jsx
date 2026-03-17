import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, clearStoredAppState } from "../api/client";
import { PasswordField } from "../components/ui/PasswordField";
import { useAuth } from "../contexts/AuthContext";
import { displayDateInput } from "../utils/formats";

const TERMS_SECTIONS = [
  {
    title: "1. Sobre o CoParental",
    paragraphs: [
      "O CoParental é uma plataforma digital criada para ajudar os responsáveis a organizar informações relacionadas à coparentalidade.",
      "A plataforma tem caráter organizacional e informativo, não substituindo orientação jurídica, contábil, financeira ou decisões judiciais."
    ],
    bullets: [
      "calendário para organização da rotina da criança",
      "registro de despesas",
      "controle e acompanhamento de pensão",
      "geração de relatórios",
      "download de informações registradas",
      "chat interno entre responsáveis vinculados",
      "gestão de perfis familiares",
      "histórico de registros"
    ]
  },
  {
    title: "2. Cadastro e conta do usuário",
    paragraphs: [
      "Para utilizar o CoParental é necessário criar uma conta.",
      "Durante o cadastro poderão ser solicitadas informações como nome, e-mail, telefone e dados básicos de perfil."
    ],
    bullets: [
      "fornecer informações verdadeiras e atualizadas",
      "manter a confidencialidade de sua senha",
      "não compartilhar sua conta com terceiros",
      "ser responsável por todas as atividades realizadas em sua conta"
    ],
    note: "O uso indevido da conta pode resultar em suspensão ou encerramento do acesso."
  },
  {
    title: "3. Funcionalidades do aplicativo",
    paragraphs: [
      "O CoParental oferece ferramentas para auxiliar na organização da coparentalidade.",
      "As informações inseridas na plataforma são de responsabilidade dos próprios usuários."
    ],
    bullets: [
      "Calendário: permite registrar compromissos, rotinas e eventos relacionados à criança",
      "Despesas: permite registrar despesas relacionadas à criança para acompanhamento entre responsáveis",
      "Pensão: permite registrar informações referentes a pagamentos ou registros relacionados à pensão",
      "Relatórios: usuários podem gerar e baixar relatórios com base nas informações registradas",
      "Chat: responsáveis vinculados podem utilizar o chat interno para comunicação relacionada à rotina da criança"
    ]
  },
  {
    title: "4. Regras de uso do chat",
    paragraphs: [
      "O chat deve ser utilizado exclusivamente para comunicação relacionada à coparentalidade."
    ],
    bullets: [
      "mensagens ofensivas",
      "ameaças",
      "assédio",
      "linguagem abusiva",
      "compartilhamento de conteúdo ilegal",
      "exposição indevida de dados pessoais de terceiros"
    ],
    note: "O uso inadequado pode resultar em suspensão da conta."
  },
  {
    title: "5. Assinatura e planos",
    paragraphs: [
      "O CoParental pode ser disponibilizado através de assinatura mensal.",
      "A assinatura concede acesso às funcionalidades da plataforma durante o período contratado.",
      "A renovação pode ocorrer automaticamente conforme o plano escolhido."
    ]
  },
  {
    title: "6. Cancelamento",
    paragraphs: [
      "O usuário pode cancelar sua assinatura a qualquer momento, pois o serviço não possui fidelidade."
    ],
    bullets: [
      "novas cobranças não serão realizadas",
      "o acesso pode permanecer ativo até o final do período já pago"
    ]
  },
  {
    title: "7. Direito de arrependimento",
    paragraphs: [
      "Nos termos do Código de Defesa do Consumidor, o usuário tem o direito de cancelar a contratação em até 7 dias corridos após a compra, com direito à restituição dos valores pagos."
    ]
  },
  {
    title: "8. Responsabilidade do usuário",
    bullets: [
      "utilizar a plataforma de forma ética e legal",
      "não inserir informações falsas",
      "não utilizar o aplicativo para fins ilegais",
      "respeitar outros usuários"
    ]
  },
  {
    title: "9. Limitação de responsabilidade",
    paragraphs: [
      "O CoParental é uma ferramenta de organização e comunicação."
    ],
    bullets: [
      "decisões tomadas pelos usuários com base nos registros da plataforma",
      "conflitos familiares ou judiciais entre responsáveis",
      "informações incorretas inseridas pelos usuários",
      "interrupções temporárias do serviço por manutenção ou falhas técnicas"
    ]
  },
  {
    title: "10. Propriedade intelectual",
    paragraphs: [
      "Todos os direitos sobre o aplicativo CoParental, incluindo software, design, logotipo, estrutura e funcionalidades, pertencem à JVR Soluções Inteligentes.",
      "É proibida a reprodução, cópia ou exploração comercial da plataforma sem autorização."
    ]
  },
  {
    title: "11. Modificações na plataforma",
    paragraphs: [
      "A empresa poderá atualizar ou modificar funcionalidades da plataforma a qualquer momento visando melhorias, segurança ou adequação legal."
    ]
  },
  {
    title: "12. Encerramento de contas",
    bullets: [
      "violação destes termos",
      "uso fraudulento",
      "comportamento abusivo",
      "atividades ilegais"
    ]
  },
  {
    title: "13. Legislação aplicável",
    paragraphs: [
      "Este Termo de Uso é regido pelas leis da República Federativa do Brasil."
    ]
  }
];

const PRIVACY_SECTIONS = [
  {
    title: "1. Dados coletados",
    paragraphs: ["Podemos coletar informações como:"],
    bullets: [
      "Dados de cadastro: nome, e-mail e telefone",
      "Dados de uso: registros de acesso, data e horário de login e interações com funcionalidades do aplicativo",
      "Dados inseridos pelos usuários: compromissos no calendário, despesas registradas, informações de pensão, mensagens enviadas no chat, dados de responsáveis vinculados e dados relacionados às crianças cadastradas"
    ]
  },
  {
    title: "2. Finalidade do uso dos dados",
    bullets: [
      "permitir o funcionamento da plataforma",
      "criar e gerenciar contas de usuários",
      "vincular responsáveis e crianças",
      "registrar despesas e informações",
      "gerar relatórios",
      "permitir comunicação via chat",
      "melhorar a experiência do usuário",
      "garantir segurança da plataforma"
    ]
  },
  {
    title: "3. Dados de crianças",
    paragraphs: [
      "O aplicativo pode conter informações relacionadas a crianças cadastradas pelos responsáveis.",
      "Esses dados devem ser inseridos apenas por responsáveis legais ou pessoas autorizadas."
    ]
  },
  {
    title: "4. Compartilhamento de dados",
    paragraphs: [
      "Os dados pessoais não são vendidos.",
      "Eles podem ser compartilhados apenas quando necessário com:"
    ],
    bullets: [
      "provedores de hospedagem",
      "serviços de pagamento",
      "ferramentas técnicas necessárias ao funcionamento da plataforma",
      "autoridades legais quando exigido por lei"
    ]
  },
  {
    title: "5. Segurança das informações",
    paragraphs: [
      "O CoParental adota medidas de segurança técnicas e administrativas para proteger os dados dos usuários contra:"
    ],
    bullets: [
      "acessos não autorizados",
      "vazamentos",
      "uso indevido",
      "alterações indevidas"
    ]
  },
  {
    title: "6. Direitos dos usuários",
    paragraphs: [
      "O usuário pode solicitar:"
    ],
    bullets: [
      "acesso aos seus dados",
      "correção de dados incorretos",
      "exclusão da conta",
      "informações sobre o tratamento de seus dados"
    ],
    note: "As solicitações podem ser feitas através dos canais de suporte do aplicativo."
  },
  {
    title: "7. Retenção de dados",
    paragraphs: [
      "Os dados podem ser armazenados enquanto a conta estiver ativa ou enquanto forem necessários para o funcionamento da plataforma ou cumprimento de obrigações legais."
    ]
  },
  {
    title: "8. Alterações na política",
    paragraphs: [
      "Esta Política de Privacidade pode ser atualizada periodicamente.",
      "Sempre que houver alterações relevantes, a nova versão será disponibilizada no aplicativo."
    ]
  },
  {
    title: "9. Contato",
    paragraphs: [
      "Para dúvidas relacionadas à privacidade ou ao funcionamento da plataforma, o usuário pode entrar em contato com a equipe responsável através dos canais de suporte disponibilizados no aplicativo."
    ]
  }
];

function LegalSection({ title, sections }) {
  return (
    <details className="legal-details">
      <summary className="legal-summary">
        <div>
          <strong>{title}</strong>
        </div>
        <span>Ler documento</span>
      </summary>
      <div className="legal-body">
        {sections.map((section) => (
          <section key={section.title} className="legal-block">
            <h4>{section.title}</h4>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.bullets?.length ? (
              <ul className="legal-list">
                {section.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {section.note ? <p className="legal-note">{section.note}</p> : null}
          </section>
        ))}
      </div>
    </details>
  );
}

export function ProfilePage() {
  const { user, familyContext, refresh } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: user.name || "",
    email: user.email || "",
    phone: user.phone || "",
    currentPassword: "",
    newPassword: ""
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copiedInvite, setCopiedInvite] = useState(false);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function saveProfile(event) {
    event.preventDefault();
    try {
      await api("/api/auth/profile", { method: "PUT", body: JSON.stringify(form) });
      setMessage("Perfil atualizado.");
      setError("");
      await refresh();
    } catch (err) {
      setError(err.message);
      setMessage("");
    }
  }

  async function logout() {
    clearStoredAppState();
    await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
    await refresh();
    navigate("/acesso");
  }

  async function copyInviteLink(link) {
    if (!link) {
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      setCopiedInvite(true);
      window.setTimeout(() => setCopiedInvite(false), 1800);
    } catch {
      setError("Não foi possível copiar o link.");
      setMessage("");
    }
  }

  const inviteLink = familyContext?.invitation?.token
    ? `${window.location.origin}/convite?token=${encodeURIComponent(familyContext.invitation.token)}`
    : "";

  return (
    <div className="page page-base44">
      <div className="page-header hero-header">
        <div>
          <h1>Dados pessoais e vínculos</h1>
          <p className="eyebrow">Perfil do usuário</p>
        </div>
      </div>

      <section className="content-grid two-col">
        <form className="card panel-card profile-form-card" onSubmit={saveProfile}>
          <h3>Meus dados</h3>
          <label className="field"><span>Nome</span><input name="name" value={form.name} onChange={updateField} /></label>
          <label className="field"><span>E-mail</span><input name="email" type="email" value={form.email} onChange={updateField} /></label>
          <label className="field"><span>Telefone</span><input name="phone" value={form.phone} onChange={updateField} /></label>
          <PasswordField label="Senha atual" name="currentPassword" value={form.currentPassword} onChange={updateField} placeholder="Obrigatória para trocar a senha" />
          <PasswordField label="Nova senha" name="newPassword" value={form.newPassword} onChange={updateField} placeholder="Deixe em branco para manter" />
          {error ? <div className="alert error">{error}</div> : null}
          {message ? <div className="alert success">{message}</div> : null}
          <button className="primary-button">Salvar alterações</button>
          <button type="button" className="ghost-button" onClick={logout}>Sair</button>
        </form>

        <article className="card panel-card profile-linked-card">
          <div className="panel-head profile-linked-head">
            <h3>Responsáveis vinculados</h3>
            <Link to="/onboarding" className="ghost-button profile-add-panel-button">+ Painel</Link>
          </div>
          {(familyContext?.members || []).map((member) => (
            <div key={member.id} className="profile-linked-item">
              <div className="profile-linked-copy">
                <strong>{member.name}</strong>
                <p>{member.email}</p>
              </div>
              <span className="profile-linked-badge">{member.relation_label}</span>
            </div>
          ))}

          {!user.is_admin ? <h3 className="spaced-title">Crianças</h3> : null}
          {(familyContext?.children || []).map((child) => (
            <div key={child.id} className="profile-linked-item child-item">
              <div className="profile-linked-copy">
                <strong>{child.name}</strong>
                <p>{child.birth_date ? displayDateInput(child.birth_date) : "Sem data cadastrada"}</p>
              </div>
            </div>
          ))}

          {familyContext?.invitation ? (
            <div className="invite-box">
              <div className="invite-box-head">
                <div>
                  <strong>Convite pendente</strong>
                  <p>Envie este link para o outro responsável preencher os dados e concluir o vínculo.</p>
                </div>
              </div>
              <div className="invite-box-meta">
                <span>E-mail do convite</span>
                <strong>{familyContext.invitation.email || "Sem e-mail"}</strong>
              </div>
              <div className="invite-token-card">
                <div className="invite-token-copy">
                  <span>Link do convite</span>
                  <strong>{inviteLink}</strong>
                </div>
                <button
                  type="button"
                  className={`ghost-button icon-only small-icon-button invite-copy-button${copiedInvite ? " copied" : ""}`}
                  onClick={() => copyInviteLink(inviteLink)}
                  aria-label="Copiar link do convite"
                  title="Copiar link"
                >
                  {copiedInvite ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>
              <div className="invite-box-meta">
                <span>Token</span>
                <strong>{familyContext.invitation.token}</strong>
              </div>
            </div>
          ) : null}
        </article>
      </section>

      <section className="card panel-card legal-card">
        <div className="legal-card-head">
          <div>
            <h3>Termos de uso e política de privacidade</h3>
            <p>Documentos legais do CoParental, desenvolvidos pela JVR Soluções Inteligentes.</p>
          </div>
          <div className="legal-card-stamp">
            <strong>Última atualização</strong>
            <span>Março de 2026</span>
          </div>
        </div>

        <div className="legal-intro">
          <p>
            Ao criar uma conta, acessar ou utilizar o aplicativo, o usuário declara que leu, compreendeu e concorda com os Termos de Uso e com a Política de Privacidade da plataforma.
          </p>
          <p>
            Caso não concorde com qualquer condição, recomenda-se não utilizar o aplicativo.
          </p>
        </div>

        <div className="legal-grid">
          <LegalSection title="TERMOS DE USO" sections={TERMS_SECTIONS} />
          <LegalSection title="POLÍTICA DE PRIVACIDADE" sections={PRIVACY_SECTIONS} />
        </div>
      </section>
    </div>
  );
}
