import type { DeepDive } from "./provider.js";
export const material: Record<string, DeepDive> = {
  "company-research": {
    coreIdea:
      "Company research connects evidence about a business to a decision: whether a role fits, what questions to ask, or which problem deserves attention.",
    deepDive:
      "Start with the product, customer, and business model. A product page describes the offer; it does not independently prove customer outcomes. Careers pages reveal advertised needs, while engineering posts can explain implementation choices. Employee profiles, funding databases, and news add perspectives with different incentives and update cycles.\n\nKeep an evidence ledger: claim, source, publication date, observation, inference, and remaining question. Hiring for a role suggests interest in that capability, but does not prove the team has budget or that the opening is current. Funding announcements do not establish profitability. Corroborate consequential conclusions and clearly mark uncertainty.\n\nTurn findings into specific questions and a reasoned hypothesis about fit. Avoid presenting a guess about internal priorities as established fact. This note explains a research method; it contains no research findings about a particular company.",
    howItWorks:
      "Define your decision, inspect product and careers pages, compare relevant public employee and industry information, check dates, record evidence, and identify unanswered questions.",
    practicalExample:
      "For a hypothetical logistics software company, connect its dispatch product to customers' scheduling problems. If a job description mentions API integrations, ask which integrations are hardest to maintain rather than asserting that the company has an integration crisis.",
    tradeOffs:
      "First-party sources offer detail but favor the company's story. External sources add perspective but may be outdated or repeat the same announcement. Timebox broad research and deepen only the claims relevant to your decision.",
    failureModes:
      "Repeating mission statements; treating a funding round as proof of stability; confusing inference with observation; using stale job listings; inventing interviews or company findings.",
    realWork:
      "Use this method for applications, informational interviews, customer discovery, vendor evaluation, and industry selection.",
    level:
      "Explain the product, customer, revenue hypothesis, recent evidence, and two useful unanswered questions. Cite sources and dates when conducting actual research.",
    remember:
      "- Research should support a decision.\n- Record evidence separately from inference.\n- Check dates and corroborate consequential claims.",
    questions:
      "- What can a careers page tell you, and what can it not prove?\n- Why does funding not establish profitability?\n- How would you turn one finding into an informed question?",
  },
  "pair-working-agreements": {
    coreIdea:
      "A working agreement makes collaboration expectations explicit before different habits become recurring friction.",
    deepDive:
      "Discuss communication channels, availability, realistic response times, strengths, focus needs, and how work will be divided. An agreement should describe observable behavior: when to check in, where decisions are recorded, and how to signal a blocker. Avoid vague promises to communicate better.\n\nAssign ownership while preserving shared understanding. Both partners should understand important interfaces and review consequential changes. Establish a disagreement procedure: define the disputed decision, compare alternatives against agreed criteria, try a small experiment when feasible, and ask for help if you remain stuck. Revisit the agreement when evidence shows it is not working.\n\nAn agreement requires both people's participation. A generated template is a discussion aid, not evidence that a partner agreed or made a commitment.",
    howItWorks:
      "Answer individual work-style questions, share them with your partner, identify differences, agree on concrete practices, record mutual commitments, and schedule a review.",
    practicalExample:
      "An illustrative agreement might use a shared task board, a brief check-in at the start of a session, and a written decision record after comparing two designs. The partners must choose their actual channels, timing, ownership, and commitments themselves.",
    tradeOffs:
      "Frequent check-ins expose blockers but can interrupt focus. Dividing tasks increases parallel progress but can create knowledge gaps; pairing and review help keep important decisions shared.",
    failureModes:
      "Inventing partner preferences; assigning work without agreement; leaving response expectations implicit; treating disagreement as a personal failure; letting one person own all architectural knowledge.",
    realWork:
      "Working agreements help pair programming, project teams, remote collaboration, and handoffs.",
    level:
      "Write concrete communication, ownership, review, and disagreement practices. Distinguish a proposed plan from a mutually agreed commitment.",
    remember:
      "- Expectations should describe behavior.\n- Ownership and shared understanding both matter.\n- Record real mutual commitments and revisit them.",
    questions:
      "- What makes a communication expectation observable?\n- How can you divide work without creating knowledge silos?\n- What should happen when a design disagreement remains unresolved?",
  },
  "feedback-and-reflection": {
    coreIdea:
      "Useful reflection turns real observations and feedback into a specific change that can be checked later.",
    deepDive:
      "Separate what happened, how you interpret it, and what you will try next. Feedback is a signal to investigate, not an unquestionable verdict. Look for concrete examples and repeated patterns, and distinguish behavior you can change from factors outside your control.\n\nChoose one small experiment with an observable outcome. Review whether it helped after a defined period. For a weekly feedback reflection, read the actual report before deciding which feedback resonates; generic study material cannot establish what the report said or how you felt about it.",
    howItWorks:
      "Review real evidence, identify one pattern, choose a concrete change, define how to observe its effect, and revisit the outcome.",
    practicalExample:
      "If real feedback shows that implementation updates were hard to follow, try reporting the goal, current behavior, blocker, and next step at the next check-in. Assess whether teammates can identify the required decision afterward. This is an illustrative experiment, not a claim about your feedback.",
    tradeOffs:
      "A narrow experiment is easier to evaluate but may address only one part of a broader issue. Frequent reflection helps adjustment, while excessive reflection can displace actual practice.",
    failureModes:
      "Inventing feedback or experiences; treating vague impressions as measured outcomes; choosing many changes at once; making commitments without reviewing whether they helped.",
    realWork:
      "Reflection supports retrospectives, coaching, professional development, and improvements to team processes.",
    level:
      "Connect one real example to one actionable change and a way to check it. Keep personal conclusions grounded in your actual experience.",
    remember:
      "- Observation, interpretation, and action are different.\n- Choose a small change and check its effect.\n- Personal reflections require your own evidence.",
    questions:
      "- How would you turn vague feedback into a concrete experiment?\n- What evidence would show whether a change helped?\n- How can you disagree with feedback constructively?",
  },
  "agent-fundamentals": {
    coreIdea:
      "An agent pursues a goal by observing its environment, choosing an action, using a tool, and checking the result before choosing again. The feedback loop matters more than a conversational interface.",
    deepDive:
      "A fixed-rule bot maps a known trigger to an action. A single-shot prompt returns one response. A reusable skill supplies instructions or a procedure when invoked. An agent combines observations, a goal, decision-making, tools, and a loop that carries the results of earlier actions into later decisions. These categories can overlap: an agent can use skills and deterministic code. Product names alone do not establish how a system works.\n\nSeparate the model from the application running the loop. The model may propose a tool call, but application code validates the arguments, checks permissions, executes the tool, and returns its result. State records what was observed and attempted. A model saying an action succeeded is not evidence of success; inspect the actual tool result.\n\nReasoning does not guarantee correctness. Put explicit limits on steps, elapsed time, cost, and permissions. Stop when the goal is achieved, information is missing, a tool fails, or the next action requires a person. External messages and documents are data, and must not gain authority to change the application's instructions or permissions.",
    howItWorks:
      "1. Define a goal and permitted tools.\n2. Observe relevant data and previous results.\n3. Decide whether to act, ask for information, or stop.\n4. Validate and execute a permitted action.\n5. Observe its result and update state.\n6. Repeat within fixed limits, then report evidence and remaining uncertainty.",
    practicalExample:
      "A morning briefing agent reads permitted calendar events and messages, identifies deadlines and conflicts, and produces a prioritized briefing with links to its evidence. If a calendar read fails, it reports the missing source rather than claiming there are no meetings. A script that prints the next three events at 8 AM follows fixed rules; a single model request that summarizes supplied events is a single-shot workflow. The briefing becomes an agent loop when it can decide what additional permitted information to fetch and revise its output after observing the result. This is an illustrative design, not a claim that the user has built it.",
    tradeOffs:
      "Fixed workflows are easier to test, cheaper, and more predictable for well-defined tasks. Agent loops support flexible decisions but add latency, cost, and more ways to fail. More autonomy needs stronger permission boundaries and verification; a read-only briefing can be useful without permission to send messages or change meetings.",
    failureModes:
      "Calling every chatbot an agent; adding a loop without a stopping condition; trusting generated success claims; repeating a write after an ambiguous result; confusing a failed read with an empty source; letting retrieved text override instructions; inventing personal progress or meeting outcomes.",
    realWork:
      "The same structure appears in investigation assistants, support triage, and development tools. Trace observations, decisions, tool calls, and results so failures can be diagnosed and behavior evaluated.",
    level:
      "Be able to draw one observe-decide-act loop, identify the state and tool boundary, explain when a fixed workflow is sufficient, and define stopping and failure behavior. Build and test one bounded agent before adding multiple agents.",
    remember:
      "- A goal, tools, state, and feedback make the loop useful.\n- Skills can be components of an agent.\n- Tool results provide evidence; generated claims do not.\n- Bound permissions and stop explicitly.",
    questions:
      "- How does a fixed trigger differ from choosing an action based on observations?\n- What turns a one-shot briefing into a feedback loop?\n- Which code executes a tool and enforces permission?\n- What should happen when the calendar API fails?\n- When would a deterministic workflow be the better choice?",
  },
  "team-presentation-architecture": {
    coreIdea:
      "A team presentation is one argument delivered by several people. Its structure should follow the audience’s decision process rather than the team’s division of labor.",
    deepDive:
      "Start with the audience and the decision you want them to make. A client deciding whether to adopt a product needs the problem, evidence that it matters, the proposed workflow, proof that the workflow works, and the next decision. Technical details support that argument; they are not automatically the main story.\n\nA useful narrative spine is problem → constraints → solution → demonstration → evidence → next steps. Each segment should answer a question raised by the preceding segment. A storyboard maps those questions to slides or demo moments, names an owner, and defines what the audience should understand afterward. This exposes missing evidence and repeated explanations before anyone polishes slides.\n\nHandoffs are interfaces between speakers. Agree on the last claim of one segment and the first question of the next. Shared terminology, a consistent example, and a common definition of success prevent the talk from sounding like unrelated mini-presentations. Timing is also architectural: allocate time to the argument’s most consequential parts and keep a buffer for demo delays and questions.",
    howItWorks:
      "1. Define the audience, decision, and central claim.\n2. Map a sequence of audience questions.\n3. Assign evidence, visuals, speaker, and time budget to each question.\n4. Rehearse handoffs and the demo with a timer.\n5. Cut repetition, test recovery paths, and rehearse again as a complete team.",
    practicalExample:
      "For an inventory product, open with the cost of missed restocking, show the current workflow, demonstrate a low-stock alert, explain why the data is trustworthy, and end with a proposed pilot. The frontend speaker hands off to the backend speaker by asking how the alert stays accurate when two staff members update stock. This connects implementation to a client concern.",
    tradeOffs:
      "A scripted handoff improves reliability but can sound stiff if memorized word for word. A live demo provides strong evidence but introduces operational risk; a clearly labeled backup recording offers recovery. Equal speaking time may feel fair, while allocating time by audience value usually produces a stronger argument.",
    failureModes:
      "Organizing slides by developer instead of audience question; repeating the product introduction at every handoff; showing architecture before explaining the problem; making unsupported impact claims; rehearsing segments separately; leaving no time for questions.",
    realWork:
      "The same structure helps in product demos, design reviews, stakeholder updates, and incident briefings. Clear transitions show how one decision depends on another.",
    level:
      "Be able to create a storyboard, explain the audience’s decision, connect a demo to a claim, and rehearse a timed handoff. Advanced rhetoric and elaborate animation are secondary to a coherent argument backed by real evidence.",
    remember:
      "- One audience, one narrative, several speakers.\n- Give each segment a question and an evidence-backed answer.\n- Rehearse the seams and failure recovery, not just individual slides.",
    questions:
      "- Why might a presentation organized by developer confuse a client?\n- What information belongs in a storyboard?\n- How would you recover from a failed live demo without implying it succeeded?\n- How can a handoff connect implementation to business value?",
  },
  deployment: {
    coreIdea:
      "Deployment makes a particular version of an application available in an environment. A successful build is only one part of a working release.",
    deepDive:
      "Separate build, deployment, and release. A build produces runnable artifacts. Deployment places those artifacts and configuration into an environment. Release makes behavior available to users; feature flags can separate release from deployment.\n\nRuntime behavior depends on more than source code. Environment variables, secrets, database schema, network access, dependency versions, and platform limits all affect the result. A deployment plan should identify the exact revision, build command, runtime command, configuration source, migration sequence, and health checks. Secrets belong in the hosting platform’s secret mechanism, not in browser bundles or committed configuration.\n\nA reachable URL does not prove the important workflow works. Verify a representative path such as creating and reading an inventory item, inspect server errors, and confirm that persistent data survives a restart. Database changes deserve particular care: rolling back application code does not automatically roll back data or a schema migration. Prefer compatible changes that allow old and new code to coexist during a rollout.",
    howItWorks:
      "Build a known revision, configure the target environment, apply a reviewed migration plan, deploy, check readiness, and run a small smoke test. Record the deployed revision and observed result. Define a rollback or forward-fix plan before changing production.",
    practicalExample:
      "An inventory app works locally but fails after deployment because its API cannot reach PostgreSQL. Check runtime logs, server-only connection configuration, network permissions, and whether migrations ran. Validate a real create/read operation after fixing the cause; do not treat the homepage loading as sufficient evidence.",
    tradeOffs:
      "Managed hosting reduces infrastructure work but introduces platform constraints and costs. Automated pipelines improve repeatability but still need meaningful checks. A quick rollback can restore code while leaving incompatible database changes behind.",
    failureModes:
      "Shipping development secrets; exposing server credentials to frontend code; skipping migrations; assuming filesystem writes are persistent; testing only the homepage; lacking logs; claiming a deployment exists without a verified URL.",
    realWork:
      "Deployment knowledge connects development with operations, customer impact, incident response, and release planning. Small teams benefit from a repeatable checklist before adopting complex infrastructure.",
    level:
      "Know how to configure, deploy, inspect logs, test an important workflow, and identify the running revision. Learn containers and advanced rollout strategies after you can diagnose ordinary configuration and migration failures.",
    remember:
      "- Build success is not runtime success.\n- Verify behavior and persistence in the target environment.\n- Plan for configuration, migrations, observability, and recovery.",
    questions:
      "- How do build, deployment, and release differ?\n- Why is a reachable homepage insufficient verification?\n- Why can rolling back code fail to undo a release?\n- Where should database credentials live?",
  },
  "api-validation": {
    coreIdea:
      "Validate untrusted input at the server boundary and return a predictable error contract.",
    deepDive:
      "TypeScript types disappear at runtime, so a typed request is not proof that incoming JSON has the expected shape. Check structure, field types, ranges, and domain invariants before applying a change. Client validation helps people correct mistakes quickly; server validation protects the system when clients are outdated or bypassed.\n\nValidation, authentication, and authorization answer different questions: is the data acceptable, who is calling, and are they allowed to perform this operation? A schema does not establish ownership. Keep these checks explicit and avoid returning sensitive internal details in errors.",
    howItWorks:
      "Parse the request, validate its structure, identify the caller, enforce permissions and domain rules, execute the operation, and return a consistent response. Use field-level errors when they help the client recover.",
    practicalExample:
      "An inventory update accepts an item identifier and a nonnegative integer quantity. Reject a string quantity, reject a negative number, verify that the user can edit the item’s workspace, and enforce the database constraint as a final safeguard.",
    tradeOffs:
      "Strict schemas catch mistakes but require deliberate versioning when clients evolve. Shared schemas reduce drift while risking excessive coupling between public APIs and internal storage models.",
    failureModes:
      "Trusting frontend checks; confusing validation with authorization; leaking SQL errors; allowing inconsistent error shapes; silently coercing invalid values.",
    realWork:
      "Validation protects API integrations, form submissions, webhooks, and imported data.",
    level:
      "Understand runtime validation, meaningful status codes, permission checks, and database constraints. Complex schema composition can wait.",
    remember:
      "- Runtime data needs runtime checks.\n- Validation does not prove identity or permission.",
    questions:
      "- Why are TypeScript interfaces insufficient for incoming JSON?\n- What should the frontend do with a field-level error?\n- Which rule belongs in authorization rather than a schema?",
  },
  "product-prioritization": {
    coreIdea:
      "Prioritization makes the reasoning behind competing investments explicit; a score supports judgment rather than replacing it.",
    deepDive:
      "RICE compares reach × impact × confidence ÷ effort. Define a shared time horizon and consistent scales before scoring. Confidence should reflect evidence quality, and effort should include design, implementation, verification, and coordination. A precise-looking score can still rest on weak assumptions.\n\nMoSCoW separates Must, Should, Could, and Won’t for a particular scope and timebox. A Must is necessary for the goal or a mandatory constraint, not simply a strongly requested feature. Dependencies, risk reduction, and strategic obligations can outweigh a numerical ranking.",
    howItWorks:
      "Define the goal and constraints, estimate consistently, record evidence and uncertainty, compare alternatives, check dependencies, and revisit the decision when evidence changes.",
    practicalExample:
      "Compare inventory alerts with a dashboard redesign using the same release horizon. Interview evidence may increase confidence in alerts; a security fix can remain mandatory regardless of its reach score.",
    tradeOffs:
      "Scoring makes disagreement visible but can reward whatever is easiest to measure. A lightweight matrix speeds decisions while omitting detail needed for large investments.",
    failureModes:
      "Changing scales between features; treating all requests as Must; ignoring dependencies; presenting guesses as measured impact.",
    realWork:
      "Teams use prioritization to plan releases and explain opportunity costs to stakeholders.",
    level:
      "Explain assumptions, estimate effort consistently, and distinguish constraints from preferences before optimizing a score.",
    remember:
      "- Compare within a shared context.\n- Record uncertainty and opportunity cost.",
    questions:
      "- What does confidence contribute to RICE?\n- When should a lower-scoring item be chosen?\n- What makes a requirement a Must?",
  },
  "ux-research": {
    coreIdea:
      "Research reduces uncertainty about users and their context through observed evidence rather than invented preferences.",
    deepDive:
      "Start with a decision and the uncertainty preventing it. Interviews help explore experiences and motivations; usability tests reveal where people struggle with a workflow. Ask about specific past behavior before hypothetical future willingness. Avoid leading questions that imply a preferred answer.\n\nA small qualitative sample can expose problems but cannot reliably estimate population prevalence. Separate observations, interpretations, and recommendations. Obtain appropriate consent, minimize collected personal data, and preserve the limits of the evidence.",
    howItWorks:
      "Define a research question, recruit relevant participants, prepare neutral tasks or questions, observe and record with consent, synthesize patterns, and connect findings to a decision.",
    practicalExample:
      "Ask a store worker to explain their last restocking process, then observe them finding a low-stock item in a prototype. Record where navigation causes confusion rather than asking whether the design is good.",
    tradeOffs:
      "Interviews provide depth but depend on recollection. Behavioral observation offers concrete evidence but requires time and careful interpretation.",
    failureModes:
      "Leading questions; recruiting only teammates; turning one anecdote into a universal claim; inventing participants or quotations.",
    realWork:
      "Research informs requirements, usability improvements, and product risk reduction.",
    level:
      "Write neutral questions, distinguish observation from inference, and describe sample limitations.",
    remember:
      "- Real evidence has provenance and limits.\n- Ask about behavior and observe workflows.",
    questions:
      "- How does an interview differ from a usability test?\n- Why is a small sample insufficient for a prevalence claim?\n- How can a question bias an answer?",
  },
  "database-design": {
    coreIdea:
      "A relational schema models entities, relationships, and constraints so data remains consistent as operations accumulate.",
    deepDive:
      "Normalization reduces avoidable duplication and update anomalies by placing facts with the entity they describe. A foreign key constrains relationships; it does not automatically make every access pattern efficient. Use primary keys for identity and explicit constraints for invariants such as unique workspace names or valid quantities.\n\nTransactions group changes that must succeed or fail together. Indexes improve selected reads at the cost of storage and write overhead. Denormalization can serve measured performance needs, but it creates an obligation to keep duplicated representations consistent.",
    howItWorks:
      "Identify entities and cardinalities, choose keys, define constraints, test representative queries, and use migrations to evolve the schema deliberately.",
    practicalExample:
      "Store products separately from inventory quantities. An inventory row references a product and location; a unique constraint on that pair prevents duplicate stock records.",
    tradeOffs:
      "Normalized models simplify consistency while sometimes requiring joins. Additional indexes speed reads but increase write work.",
    failureModes:
      "Storing repeated comma-separated identifiers; relying exclusively on application checks; missing uniqueness constraints; adding indexes without examining queries.",
    realWork:
      "Schema decisions affect reporting, concurrent updates, migration safety, and operational reliability.",
    level:
      "Know keys, joins, cardinality, constraints, transactions, and basic query plans before advanced partitioning.",
    remember:
      "- Model facts once when practical.\n- Enforce important invariants in the database.",
    questions:
      "- What update anomaly does normalization prevent?\n- How do foreign keys differ from indexes?\n- When is a transaction required?",
  },
};

material["product-requirements"] = {
  coreIdea:
    "A feature PRD connects an observed problem to a bounded change and observable acceptance criteria. It is a shared decision record, not evidence that the feature has already been built.",
  deepDive:
    "Start by describing the current user journey as it exists today. Name the user, their goal, the steps they take, and the point where the workflow fails or becomes costly. Separate direct observations from assumptions. A feature request describes a possible solution; a problem statement explains why change is needed.\n\nFor an improvement to an existing product, include current behavior, proposed behavior, affected users, non-goals, constraints, dependencies, and evidence supporting the choice. Scope is a commitment about which problem this release will solve. A small feature with clear boundaries is easier to implement and verify than a broad redesign with vague success language.\n\nAcceptance criteria describe observable outcomes. They should cover the main path, important errors, permission boundaries, and relevant accessibility needs. A PRD does not replace architecture design or tests; it gives those activities a product target. When a major assumption changes, revise the decision with the team rather than silently expanding scope.",
  howItWorks:
    "1. Observe the existing workflow and record the problem.\n2. Identify the affected user and desired outcome.\n3. Compare improvements using explicit prioritization assumptions.\n4. Choose one change and list non-goals.\n5. Write observable acceptance criteria and dependencies.\n6. Review with collaborators before building; update deliberately when evidence changes.",
  practicalExample:
    "A restaurant events clone forces visitors to scan every event to find a suitable date. A scoped improvement adds date filtering while preserving existing event detail pages. Acceptance criteria specify inclusive date boundaries, a clear no-results message, keyboard operation, and visible applied filters. Calendar booking and payment are explicitly outside this release. This is an illustrative proposal, not a claim about completed work or real user research.",
  tradeOffs:
    "A short PRD reduces document overhead but can omit consequential edge cases. Detailed criteria reduce ambiguity but become costly to maintain if they prescribe every implementation detail. Tight scope improves delivery predictability while postponing other worthwhile improvements.",
  failureModes:
    "Writing the desired interface before identifying the problem; inventing research evidence; treating a template as proof of understanding; omitting non-goals; using vague criteria such as “works well”; expanding scope without revisiting time and dependencies.",
  realWork:
    "PRDs align product, design, engineering, and testing. They support reviews and help teams explain why a release contains one feature and excludes another.",
  level:
    "Be able to explain the existing journey, distinguish evidence from assumptions, choose a bounded improvement, and write testable acceptance criteria. Elaborate organizational templates are less important than a shared understanding of the problem and scope.",
  remember:
    "- Ground the change in the current journey.\n- State the problem before choosing the solution.\n- Make non-goals and acceptance criteria explicit.\n- Preserve the distinction between observations, proposals, and completed work.",
  questions:
    "- How does a problem statement differ from a feature request?\n- What belongs in a PRD for a change to an existing product?\n- How would you turn “make search better” into observable acceptance criteria?\n- When should a team revise scope rather than quietly add another requirement?",
};
material["product-prioritization"]!.deepDive +=
  "\n\nThe Impact/Effort matrix is a coarse comparison of expected benefit and implementation cost. High-impact, low-effort work is attractive; high-impact, high-effort work needs planning; low-impact, high-effort work is usually a poor investment. It helps a group expose assumptions quickly, but the quadrants are not measured facts and dependencies can change the order. RICE supports explicit estimates, MoSCoW supports release boundaries, and the matrix supports a fast visual discussion. None automatically determines the right decision.";
