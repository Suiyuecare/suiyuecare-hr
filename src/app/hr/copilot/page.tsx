import { getAiResult } from "@/server/ai/demo-store";
import type {
  AiApprovalSummary,
  AiFormDraft,
  AiPayrollExplanation,
  AiPolicyAnswer,
} from "@/server/ai/types";

type SearchParams = Promise<{
  result?: string;
  error?: string;
}>;

export default async function HrCopilotPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const result = getAiResult(params.result);

  return (
    <main className="page">
      <section className="page-header">
        <h1>AI Copilot</h1>
        <p>AI can explain, summarize, and draft. Final HR decisions stay human-only.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Blocked</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <form action="/api/ai/policy" method="post" className="panel span-4 mini-form">
          <h2>Policy Q&A</h2>
          <label>
            Question
            <textarea name="question" defaultValue="How does annual leave approval affect balance?" required />
          </label>
          <button className="button primary" type="submit">
            Ask with sources
          </button>
          <a className="button" href="/hr/policy-sources">
            Manage sources
          </a>
        </form>

        <form action="/api/ai/form-draft" method="post" className="panel span-4 mini-form">
          <h2>Draft a form</h2>
          <label>
            Describe the HR form
            <textarea name="prompt" defaultValue="Create a training request form reviewed by manager then HR." required />
          </label>
          <button className="button primary" type="submit">
            Draft only
          </button>
        </form>

        <form action="/api/ai/payroll-explainer" method="post" className="panel span-4 mini-form">
          <h2>Payroll explainer</h2>
          <label>
            Payroll item code
            <input name="itemCode" placeholder="overtime, base, meal" />
          </label>
          <button className="button primary" type="submit">
            Explain exception
          </button>
        </form>

        <section className="panel span-12">
          <h2>Result</h2>
          {!result ? <p className="muted">No Copilot result yet.</p> : <ResultCard result={result.result} />}
        </section>

        {result && "fields" in result.result ? <FormDraftConfirmation draft={result.result} /> : null}
      </section>
    </main>
  );
}

function ResultCard({
  result,
}: {
  result: AiPolicyAnswer | AiFormDraft | AiPayrollExplanation | AiApprovalSummary;
}) {
  if ("confidence" in result) {
    return (
      <div className="ai-result">
        <span className="badge warning">{result.label}</span>
        <p>{result.answer}</p>
        <SourceList sources={result.sources} />
        <small className="muted">Output hash: {result.outputHash}</small>
      </div>
    );
  }

  if ("fields" in result) {
    return (
      <div className="ai-result">
        <span className="badge warning">{result.label}</span>
        <h3>{result.title}</h3>
        <p>{result.description}</p>
        <p className="muted">{result.safetyNote}</p>
        <ul className="task-list">
          {result.fields.map((field) => (
            <li className="task" key={field.id}>
              <span>
                <strong>{field.label}</strong>
                <small>
                  {field.type} · {field.required ? "required" : "optional"}
                </small>
              </span>
              <span className="badge">{field.id}</span>
            </li>
          ))}
        </ul>
        <small className="muted">Output hash: {result.outputHash}</small>
      </div>
    );
  }

  if ("contributingRecords" in result) {
    return (
      <div className="ai-result">
        <span className="badge warning">{result.label}</span>
        <p>{result.summary}</p>
        <SourceList sources={result.contributingRecords} />
        <ul>
          {result.nextSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
        <small className="muted">Output hash: {result.outputHash}</small>
      </div>
    );
  }

  return (
    <div className="ai-result">
      <span className="badge warning">{result.label}</span>
      <p>{result.summary}</p>
      <ul>
        {result.verify.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <small className="muted">Output hash: {result.outputHash}</small>
    </div>
  );
}

function FormDraftConfirmation({ draft }: { draft: AiFormDraft }) {
  return (
    <section className="panel span-12">
      <form action="/api/forms/templates" method="post" className="mini-form ai-confirm-form">
        <input type="hidden" name="title" value={draft.title} />
        <input type="hidden" name="description" value={draft.description} />
        <input type="hidden" name="category" value={draft.category} />
        <input type="hidden" name="fieldLabel" value={draft.fields[0]?.label ?? "Request detail"} />
        <input type="hidden" name="fieldType" value={draft.fields[0]?.type ?? "text"} />
        <input type="hidden" name="required" value="on" />
        <input type="hidden" name="includeHr" value="on" />
        <button className="button primary" type="submit">
          HR confirm and save
        </button>
      </form>
    </section>
  );
}

function SourceList({ sources }: { sources: Array<{ id: string; title: string; excerpt: string }> }) {
  if (sources.length === 0) {
    return <p className="muted">No approved source references found.</p>;
  }

  return (
    <ul className="task-list">
      {sources.map((source) => (
        <li className="task" key={source.id}>
          <span>
            <strong>{source.title}</strong>
            <small>{source.excerpt}</small>
          </span>
          <span className="badge">{source.id}</span>
        </li>
      ))}
    </ul>
  );
}
