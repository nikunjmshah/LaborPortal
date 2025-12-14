/* Supabase-backed storage layer for LaborPortal */
(function () {
  const SESSION_KEY = "lp_session";
  if (!window.supabaseClient) {
    console.error("Supabase client missing. Load supabase-js CDN and supabaseClient.js first.");
    return;
  }
  const sb = window.supabaseClient;

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  function getSession() { return readJson(SESSION_KEY, null); }
  function setSession(session) { writeJson(SESSION_KEY, session); }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  async function sha256(text) {
    const enc = new TextEncoder();
    const data = enc.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function requireRole(expectedRole) {
    const session = getSession();
    if (!session) return { ok: false, reason: "no_session" };
    if (expectedRole && session.role !== expectedRole) return { ok: false, reason: "wrong_role" };
    return { ok: true, session };
  }
  function logout() { clearSession(); }

  async function ensureSeedData() {
    // no-op: Supabase holds data; seeds can be added manually if desired
    return;
  }

  async function verifyOrSetupRecruiter(email, password) {
    await ensureSeedData();
    const passHash = await sha256(password);
    const { data: rows, error } = await sb.from("recruiter_auth").select("*").limit(1);
    if (error) return { ok: false, error: error.message };
    if (!rows || rows.length === 0) {
      const ins = await sb.from("recruiter_auth").insert({ email: email || "recruiter", password_hash: passHash }).select().single();
      if (ins.error) return { ok: false, error: ins.error.message };
      const session = { username: email || "recruiter", role: "recruiter", name: "Recruiter" };
      setSession(session);
      return { ok: true, session, setup: true };
    }
    const rec = rows[0];
    if (rec.email && email && rec.email !== email) return { ok: false, error: "Email does not match configured recruiter" };
    if (rec.password_hash !== passHash) return { ok: false, error: "Invalid password" };
    const session = { username: rec.email || "recruiter", role: "recruiter", name: "Recruiter" };
    setSession(session);
    return { ok: true, session };
  }

  async function loginLabor(name, contact, passkey) {
    await ensureSeedData();
    if (!name || !contact) return { ok: false, error: "Missing name or contact" };
    if ((passkey || "") !== "1234") return { ok: false, error: "Invalid passkey" };
    if (!/^\d{10}$/.test(String(contact).trim())) return { ok: false, error: "Contact must be 10 digits" };
    const c = String(contact).trim();
    const { error } = await sb.from("laborers").upsert({ contact: c, name: String(name).trim() });
    if (error) return { ok: false, error: error.message };
    const session = { username: c, role: "laborer", name: String(name).trim(), contact: c };
    setSession(session);
    return { ok: true, session };
  }

  function normalizeJob(row) {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      pricePerHour: row.price_per_hour,
      requiredCount: row.required_count,
      createdBy: row.created_by,
      createdAt: row.created_at,
      location: row.location,
      startDateTime: row.start_datetime,
      applicants: (row.applicants || []).map(a => ({
        id: a.id,
        name: a.name,
        contact: a.contact,
        appliedAt: a.created_at
      }))
    };
  }

  async function getJobsWithApplicants(filter) {
    let query = sb.from("jobs").select("*, applicants(*)").order("created_at", { ascending: false });
    if (filter?.byRecruiter) query = query.eq("created_by", filter.byRecruiter);
    const { data, error } = await query;
    if (error) return { ok: false, error: error.message, jobs: [] };
    return { ok: true, jobs: (data || []).map(normalizeJob) };
  }

  async function addJob({ title, description, pricePerHour, requiredCount, createdBy, location, startDateTime }) {
    const { data, error } = await sb.from("jobs").insert({
      title: title.trim(),
      description: description.trim(),
      price_per_hour: Number(pricePerHour),
      required_count: Number(requiredCount),
      created_by: createdBy,
      location: (location || "").trim(),
      start_datetime: startDateTime || null
    }).select().single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, job: normalizeJob(data) };
  }

  async function deleteJob(id, byUser) {
    const { data: job, error: errJob } = await sb.from("jobs").select("id, created_by").eq("id", id).single();
    if (errJob || !job) return false;
    if (job.created_by !== byUser) return false;
    const { error } = await sb.from("jobs").delete().eq("id", id);
    return !error;
  }

  async function applyToJobWithDetails(jobId, applicant) {
    if (!applicant || !applicant.name || !applicant.contact) return { ok: false, error: "Missing required details" };
    if (!/^\d{10}$/.test(String(applicant.contact).trim())) return { ok: false, error: "Contact must be 10 digits" };
    if ((applicant.passkey || "") !== "1234") return { ok: false, error: "Invalid passkey" };
    const { data: job, error } = await sb.from("jobs")
      .select("id, required_count, applicants(contact)")
      .eq("id", jobId)
      .single();
    if (error || !job) return { ok: false, error: "Job not found" };
    if ((job.applicants || []).some(a => a.contact === applicant.contact)) return { ok: false, error: "You already signed up" };
    if ((job.applicants || []).length >= job.required_count) return { ok: false, error: "Job filled" };
    const ins = await sb.from("applicants").insert({
      job_id: jobId,
      name: applicant.name.trim(),
      contact: applicant.contact.trim()
    });
    if (ins.error) return { ok: false, error: ins.error.message };
    return { ok: true };
  }

  async function unapplyFromJobByContact(jobId, contact) {
    const { error } = await sb.from("applicants").delete().eq("job_id", jobId).eq("contact", String(contact).trim());
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function getJobsForRecruiter(username) {
    const res = await getJobsWithApplicants({ byRecruiter: username });
    if (!res.ok) return [];
    return res.jobs;
  }

  async function getOpenJobs() {
    const res = await getJobsWithApplicants();
    if (!res.ok) return [];
    return res.jobs.filter(j => j.applicants.length < j.requiredCount);
  }

  async function getJobsForLaborer(username) {
    const res = await getJobsWithApplicants();
    if (!res.ok) return [];
    return res.jobs.filter(j => j.applicants.some(a => a.contact === username || a.user === username));
  }

  window.LPStorage = {
    ensureSeedData,
    getSession, setSession, clearSession,
    loginLabor, logout, requireRole,
    verifyOrSetupRecruiter,
    addJob, deleteJob,
    applyToJobWithDetails,
    unapplyFromJobByContact,
    getJobsForRecruiter, getOpenJobs, getJobsForLaborer
  };
})();


