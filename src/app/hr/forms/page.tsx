import { getDemoSession } from "@/server/auth/demo-session";
import { getFormTemplates } from "@/server/workflows/service";

export default async function HrFormsPage() {
  const session = await getDemoSession();
  const templates = await getFormTemplates(session);

  return (
    <main className="page">
      <section className="page-header">
        <h1>Form Builder</h1>
        <p>Create simple employee forms and choose who reviews them.</p>
      </section>

      <section className="grid">
        <form action="/api/forms/templates" method="post" className="panel span-8 wizard-form">
          <h2>New form wizard</h2>

          <fieldset>
            <legend>1. Form basics</legend>
            <label>
              Title
              <input name="title" defaultValue="Training request" required />
            </label>
            <label>
              Description
              <input name="description" defaultValue="Request external training approval." />
            </label>
            <label>
              Category
              <input name="category" defaultValue="Learning" />
            </label>
          </fieldset>

          <fieldset>
            <legend>2. First field</legend>
            <label>
              Field label
              <input name="fieldLabel" defaultValue="Training course" required />
            </label>
            <label>
              Field type
              <select name="fieldType" defaultValue="text">
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
                <option value="select">Select</option>
                <option value="file">File</option>
                <option value="checkbox">Checkbox</option>
                <option value="textarea">Textarea</option>
              </select>
            </label>
            <label>
              Select options
              <input name="options" placeholder="Option A, Option B" />
            </label>
            <label className="check-row">
              <input name="required" type="checkbox" defaultChecked />
              Required
            </label>
          </fieldset>

          <fieldset>
            <legend>3. Field visibility</legend>
            <label>
              Show Notes only when first field equals
              <input name="notesVisibleWhenPrimaryEquals" placeholder="Leave blank to always show Notes" />
            </label>
            <label className="check-row">
              <input name="notesRequired" type="checkbox" />
              Require Notes when visible
            </label>
            <p className="muted">Use this to keep employee forms short unless a specific answer needs more detail.</p>
          </fieldset>

          <fieldset>
            <legend>4. Review flow</legend>
            <label className="check-row">
              <input type="checkbox" checked readOnly />
              Direct manager review
            </label>
            <label className="check-row">
              <input name="includeHr" type="checkbox" defaultChecked />
              HR review after manager
            </label>
            <label>
              HR review only when first field equals
              <input name="hrConditionValue" placeholder="Leave blank to always include HR" />
            </label>
            <p className="muted">Use this for forms where only certain answers need HR review.</p>
          </fieldset>

          <button className="button primary" type="submit">
            Create form
          </button>
        </form>

        <section className="panel span-4">
          <h2>Active forms</h2>
          <ul className="task-list">
            {templates.map((template) => (
              <li className="task" key={template.id}>
                <span>
                  <strong>{template.title}</strong>
                  <small>
                    {template.category} · {template.workflowSteps.length} review step(s)
                  </small>
                  <small>{template.visibilitySummary}</small>
                  {template.workflowSteps.some((step) => step.condition) ? (
                    <small>Conditional HR review enabled</small>
                  ) : null}
                </span>
                <span className="badge">{template.status}</span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}
