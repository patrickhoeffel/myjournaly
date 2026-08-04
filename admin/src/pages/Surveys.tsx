import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
} from "@mui/material";
import {
  Add,
  Edit,
  Delete,
  Refresh,
  ExpandMore,
} from "@mui/icons-material";
import { apiFetch } from "../lib/api";

// ── Types ──

interface Survey {
  id: string;
  resource_id: string;
  title: string;
  description: string | null;
  randomize_sections: boolean;
  randomize_questions: boolean;
  allow_back: boolean;
  show_progress: boolean;
  scoring_enabled: boolean;
  is_active: boolean;
}

interface SurveySection {
  id: string;
  survey_id: string;
  title: string;
  description: string | null;
  order: number;
}

interface SurveyQuestion {
  id: string;
  survey_id: string;
  section_id: string;
  text: string;
  answer_type: string;
  options: string[];
  range_min: number;
  range_max: number;
  range_min_label: string | null;
  range_max_label: string | null;
  order: number;
  is_required: boolean;
  score_weights: Record<string, number>;
}

interface Resource {
  id: string;
  title: string;
  resource_type: string;
}

const ANSWER_TYPES = [
  "short_answer",
  "long_answer",
  "select_one",
  "select_one_or_more",
  "select_zero_or_more",
  "range",
  "yes_no",
  "number",
];

// ── Empty forms ──

const emptySurveyForm = {
  resource_id: "",
  title: "",
  description: "",
  randomize_sections: false,
  randomize_questions: false,
  allow_back: true,
  show_progress: true,
  scoring_enabled: false,
  is_active: true,
};

const emptySectionForm = {
  title: "",
  description: "",
  order: 0,
};

const emptyQuestionForm = {
  section_id: "",
  text: "",
  answer_type: "short_answer",
  options: [] as string[],
  range_min: 1,
  range_max: 10,
  range_min_label: "",
  range_max_label: "",
  order: 0,
  is_required: true,
  score_weights: {} as Record<string, number>,
};

export default function Surveys() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" });

  // Survey dialog
  const [surveyDialogOpen, setSurveyDialogOpen] = useState(false);
  const [editingSurveyId, setEditingSurveyId] = useState<string | null>(null);
  const [surveyForm, setSurveyForm] = useState(emptySurveyForm);

  // Builder view
  const [activeSurveyId, setActiveSurveyId] = useState<string | null>(null);
  const [sections, setSections] = useState<SurveySection[]>([]);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [builderLoading, setBuilderLoading] = useState(false);

  // Section dialog
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionForm, setSectionForm] = useState(emptySectionForm);

  // Question dialog
  const [questionDialogOpen, setQuestionDialogOpen] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [questionForm, setQuestionForm] = useState(emptyQuestionForm);
  const [optionInput, setOptionInput] = useState("");

  const notify = (message: string, severity: "success" | "error" = "success") =>
    setSnackbar({ open: true, message, severity });

  // ── Load ──

  const loadSurveys = async () => {
    setLoading(true);
    try {
      const [sData, rData] = await Promise.all([
        apiFetch("/admin/surveys"),
        apiFetch("/admin/resources"),
      ]);
      setSurveys(sData);
      setResources(rData.filter((r: Resource) => r.resource_type === "survey"));
    } catch {
      notify("Failed to load surveys", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadBuilder = async (surveyId: string) => {
    setBuilderLoading(true);
    try {
      const [secData, qData] = await Promise.all([
        apiFetch(`/admin/surveys/${surveyId}/sections`),
        apiFetch(`/admin/surveys/${surveyId}/questions`),
      ]);
      setSections(secData);
      setQuestions(qData);
    } catch {
      notify("Failed to load survey details", "error");
    } finally {
      setBuilderLoading(false);
    }
  };

  useEffect(() => { loadSurveys(); }, []);

  // ── Survey CRUD ──

  const openCreateSurvey = () => {
    setEditingSurveyId(null);
    setSurveyForm(emptySurveyForm);
    setSurveyDialogOpen(true);
  };

  const openEditSurvey = (s: Survey) => {
    setEditingSurveyId(s.id);
    setSurveyForm({
      resource_id: s.resource_id,
      title: s.title,
      description: s.description || "",
      randomize_sections: s.randomize_sections,
      randomize_questions: s.randomize_questions,
      allow_back: s.allow_back,
      show_progress: s.show_progress,
      scoring_enabled: s.scoring_enabled,
      is_active: s.is_active,
    });
    setSurveyDialogOpen(true);
  };

  const handleSaveSurvey = async () => {
    const payload = { ...surveyForm, description: surveyForm.description || null };
    try {
      if (editingSurveyId) {
        await apiFetch(`/admin/surveys/${editingSurveyId}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/admin/surveys", { method: "POST", body: JSON.stringify(payload) });
      }
      setSurveyDialogOpen(false);
      notify(editingSurveyId ? "Survey updated" : "Survey created");
      loadSurveys();
    } catch {
      notify("Failed to save survey", "error");
    }
  };

  const handleDeleteSurvey = async (id: string) => {
    if (!confirm("Delete this survey and all its sections/questions?")) return;
    try {
      await apiFetch(`/admin/surveys/${id}`, { method: "DELETE" });
      setSurveys((prev) => prev.filter((s) => s.id !== id));
      if (activeSurveyId === id) setActiveSurveyId(null);
      notify("Survey deleted");
    } catch {
      notify("Failed to delete survey", "error");
    }
  };

  const openBuilder = (surveyId: string) => {
    setActiveSurveyId(surveyId);
    loadBuilder(surveyId);
  };

  // ── Section CRUD ──

  const openCreateSection = () => {
    setEditingSectionId(null);
    setSectionForm({ ...emptySectionForm, order: sections.length });
    setSectionDialogOpen(true);
  };

  const openEditSection = (s: SurveySection) => {
    setEditingSectionId(s.id);
    setSectionForm({ title: s.title, description: s.description || "", order: s.order });
    setSectionDialogOpen(true);
  };

  const handleSaveSection = async () => {
    const payload = { ...sectionForm, description: sectionForm.description || null, survey_id: activeSurveyId };
    try {
      if (editingSectionId) {
        await apiFetch(`/admin/surveys/${activeSurveyId}/sections/${editingSectionId}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetch(`/admin/surveys/${activeSurveyId}/sections`, { method: "POST", body: JSON.stringify(payload) });
      }
      setSectionDialogOpen(false);
      notify(editingSectionId ? "Section updated" : "Section created");
      loadBuilder(activeSurveyId!);
    } catch {
      notify("Failed to save section", "error");
    }
  };

  const handleDeleteSection = async (sectionId: string) => {
    if (!confirm("Delete this section and its questions?")) return;
    try {
      await apiFetch(`/admin/surveys/${activeSurveyId}/sections/${sectionId}`, { method: "DELETE" });
      notify("Section deleted");
      loadBuilder(activeSurveyId!);
    } catch {
      notify("Failed to delete section", "error");
    }
  };

  // ── Question CRUD ──

  const openCreateQuestion = (sectionId: string) => {
    setEditingQuestionId(null);
    const sectionQuestions = questions.filter((q) => q.section_id === sectionId);
    setQuestionForm({ ...emptyQuestionForm, section_id: sectionId, order: sectionQuestions.length });
    setQuestionDialogOpen(true);
  };

  const openEditQuestion = (q: SurveyQuestion) => {
    setEditingQuestionId(q.id);
    setQuestionForm({
      section_id: q.section_id,
      text: q.text,
      answer_type: q.answer_type,
      options: q.options || [],
      range_min: q.range_min,
      range_max: q.range_max,
      range_min_label: q.range_min_label || "",
      range_max_label: q.range_max_label || "",
      order: q.order,
      is_required: q.is_required,
      score_weights: q.score_weights || {},
    });
    setQuestionDialogOpen(true);
  };

  const handleSaveQuestion = async () => {
    const payload = {
      ...questionForm,
      survey_id: activeSurveyId,
      range_min_label: questionForm.range_min_label || null,
      range_max_label: questionForm.range_max_label || null,
    };
    try {
      if (editingQuestionId) {
        await apiFetch(`/admin/surveys/${activeSurveyId}/questions/${editingQuestionId}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetch(`/admin/surveys/${activeSurveyId}/questions`, { method: "POST", body: JSON.stringify(payload) });
      }
      setQuestionDialogOpen(false);
      notify(editingQuestionId ? "Question updated" : "Question created");
      loadBuilder(activeSurveyId!);
    } catch {
      notify("Failed to save question", "error");
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm("Delete this question?")) return;
    try {
      await apiFetch(`/admin/surveys/${activeSurveyId}/questions/${questionId}`, { method: "DELETE" });
      notify("Question deleted");
      loadBuilder(activeSurveyId!);
    } catch {
      notify("Failed to delete question", "error");
    }
  };

  const resourceName = (rid: string) => resources.find((r) => r.id === rid)?.title || rid;
  const activeSurvey = surveys.find((s) => s.id === activeSurveyId);
  const showSelectTypes = ["select_one", "select_one_or_more", "select_zero_or_more"].includes(questionForm.answer_type);

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Typography variant="h4">
          {activeSurveyId ? (
            <>
              <Button onClick={() => setActiveSurveyId(null)} sx={{ mr: 1 }}>← Back</Button>
              {activeSurvey?.title || "Survey Builder"}
            </>
          ) : (
            "Surveys"
          )}
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          {activeSurveyId ? (
            <Button variant="contained" startIcon={<Add />} onClick={openCreateSection}>Add Section</Button>
          ) : (
            <Button variant="contained" startIcon={<Add />} onClick={openCreateSurvey}>New Survey</Button>
          )}
          <Tooltip title="Refresh">
            <IconButton onClick={() => activeSurveyId ? loadBuilder(activeSurveyId) : loadSurveys()}>
              <Refresh />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* ── Survey List ── */}
      {!activeSurveyId && (
        loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}><CircularProgress /></Box>
        ) : surveys.length === 0 ? (
          <Alert severity="info">No surveys yet. Create a Resource of type "survey" first, then create a Survey here linked to it.</Alert>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Title</TableCell>
                  <TableCell>Resource</TableCell>
                  <TableCell>Settings</TableCell>
                  <TableCell>Active</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {surveys.map((s) => (
                  <TableRow key={s.id} hover>
                    <TableCell>
                      <Typography
                        fontWeight={500}
                        sx={{ cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
                        onClick={() => openBuilder(s.id)}
                      >
                        {s.title}
                      </Typography>
                      {s.description && <Typography variant="caption" color="text.secondary">{s.description}</Typography>}
                    </TableCell>
                    <TableCell><Chip label={resourceName(s.resource_id)} size="small" /></TableCell>
                    <TableCell>
                      {s.scoring_enabled && <Chip label="Scored" size="small" color="primary" sx={{ mr: 0.5 }} />}
                      {s.randomize_questions && <Chip label="Randomized" size="small" variant="outlined" sx={{ mr: 0.5 }} />}
                    </TableCell>
                    <TableCell>{s.is_active ? "Yes" : "No"}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Build"><IconButton size="small" onClick={() => openBuilder(s.id)}><Edit /></IconButton></Tooltip>
                      <Tooltip title="Settings"><IconButton size="small" onClick={() => openEditSurvey(s)}><Edit /></IconButton></Tooltip>
                      <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => handleDeleteSurvey(s.id)}><Delete /></IconButton></Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )
      )}

      {/* ── Builder View ── */}
      {activeSurveyId && (
        builderLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}><CircularProgress /></Box>
        ) : sections.length === 0 ? (
          <Alert severity="info">No sections yet. Add a section to start building your survey.</Alert>
        ) : (
          sections.map((sec) => {
            const secQuestions = questions.filter((q) => q.section_id === sec.id).sort((a, b) => a.order - b.order);
            return (
              <Accordion key={sec.id} defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
                    <Typography fontWeight={600}>Section {sec.order + 1}: {sec.title}</Typography>
                    <Chip label={`${secQuestions.length} questions`} size="small" sx={{ ml: 1 }} />
                    <Box sx={{ ml: "auto", mr: 2 }}>
                      <Tooltip title="Edit section"><IconButton size="small" onClick={(e) => { e.stopPropagation(); openEditSection(sec); }}><Edit /></IconButton></Tooltip>
                      <Tooltip title="Delete section"><IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); handleDeleteSection(sec.id); }}><Delete /></IconButton></Tooltip>
                    </Box>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {sec.description && <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{sec.description}</Typography>}
                  {secQuestions.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">No questions in this section.</Typography>
                  ) : (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell width={40}>#</TableCell>
                            <TableCell>Question</TableCell>
                            <TableCell>Type</TableCell>
                            <TableCell>Required</TableCell>
                            <TableCell align="right">Actions</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {secQuestions.map((q, idx) => (
                            <TableRow key={q.id} hover sx={{ cursor: "pointer" }} onDoubleClick={() => openEditQuestion(q)}>
                              <TableCell>{idx + 1}</TableCell>
                              <TableCell>
                                <Typography variant="body2">{q.text}</Typography>
                                {q.options.length > 0 && (
                                  <Box sx={{ mt: 0.5, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                                    {q.options.map((o) => <Chip key={o} label={o} size="small" variant="outlined" />)}
                                  </Box>
                                )}
                              </TableCell>
                              <TableCell><Chip label={q.answer_type} size="small" /></TableCell>
                              <TableCell>{q.is_required ? "Yes" : "No"}</TableCell>
                              <TableCell align="right">
                                <Tooltip title="Edit"><IconButton size="small" onClick={() => openEditQuestion(q)}><Edit /></IconButton></Tooltip>
                                <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => handleDeleteQuestion(q.id)}><Delete /></IconButton></Tooltip>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                  <Button size="small" startIcon={<Add />} onClick={() => openCreateQuestion(sec.id)} sx={{ mt: 1 }}>
                    Add Question
                  </Button>
                </AccordionDetails>
              </Accordion>
            );
          })
        )
      )}

      {/* ── Survey Dialog ── */}
      <Dialog open={surveyDialogOpen} onClose={() => setSurveyDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingSurveyId ? "Edit Survey" : "New Survey"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <FormControl fullWidth>
            <InputLabel>Linked Resource</InputLabel>
            <Select label="Linked Resource" value={surveyForm.resource_id} onChange={(e) => setSurveyForm({ ...surveyForm, resource_id: e.target.value })}>
              {resources.map((r) => <MenuItem key={r.id} value={r.id}>{r.title}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField label="Title" value={surveyForm.title} onChange={(e) => setSurveyForm({ ...surveyForm, title: e.target.value })} fullWidth />
          <TextField label="Description" value={surveyForm.description} onChange={(e) => setSurveyForm({ ...surveyForm, description: e.target.value })} fullWidth multiline rows={2} />
          <Divider />
          <FormControlLabel control={<Switch checked={surveyForm.randomize_sections} onChange={(e) => setSurveyForm({ ...surveyForm, randomize_sections: e.target.checked })} />} label="Randomize section order" />
          <FormControlLabel control={<Switch checked={surveyForm.randomize_questions} onChange={(e) => setSurveyForm({ ...surveyForm, randomize_questions: e.target.checked })} />} label="Randomize question order within sections" />
          <FormControlLabel control={<Switch checked={surveyForm.allow_back} onChange={(e) => setSurveyForm({ ...surveyForm, allow_back: e.target.checked })} />} label="Allow going back to previous questions" />
          <FormControlLabel control={<Switch checked={surveyForm.show_progress} onChange={(e) => setSurveyForm({ ...surveyForm, show_progress: e.target.checked })} />} label="Show progress indicator" />
          <FormControlLabel control={<Switch checked={surveyForm.scoring_enabled} onChange={(e) => setSurveyForm({ ...surveyForm, scoring_enabled: e.target.checked })} />} label="Enable scoring" />
          <FormControlLabel control={<Switch checked={surveyForm.is_active} onChange={(e) => setSurveyForm({ ...surveyForm, is_active: e.target.checked })} />} label="Active" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSurveyDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveSurvey} disabled={!surveyForm.title || !surveyForm.resource_id}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* ── Section Dialog ── */}
      <Dialog open={sectionDialogOpen} onClose={() => setSectionDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingSectionId ? "Edit Section" : "New Section"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField label="Title" value={sectionForm.title} onChange={(e) => setSectionForm({ ...sectionForm, title: e.target.value })} fullWidth />
          <TextField label="Description" value={sectionForm.description} onChange={(e) => setSectionForm({ ...sectionForm, description: e.target.value })} fullWidth multiline rows={2} />
          <TextField label="Order" type="number" value={sectionForm.order} onChange={(e) => setSectionForm({ ...sectionForm, order: parseInt(e.target.value) || 0 })} fullWidth />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSectionDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveSection} disabled={!sectionForm.title}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* ── Question Dialog ── */}
      <Dialog open={questionDialogOpen} onClose={() => setQuestionDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingQuestionId ? "Edit Question" : "New Question"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField label="Question Text" value={questionForm.text} onChange={(e) => setQuestionForm({ ...questionForm, text: e.target.value })} fullWidth multiline rows={2} />
          <Box sx={{ display: "flex", gap: 2 }}>
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>Answer Type</InputLabel>
              <Select label="Answer Type" value={questionForm.answer_type} onChange={(e) => setQuestionForm({ ...questionForm, answer_type: e.target.value })}>
                {ANSWER_TYPES.map((t) => <MenuItem key={t} value={t}>{t.replace(/_/g, " ")}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField label="Order" type="number" value={questionForm.order} onChange={(e) => setQuestionForm({ ...questionForm, order: parseInt(e.target.value) || 0 })} sx={{ width: 100 }} />
            <FormControlLabel control={<Switch checked={questionForm.is_required} onChange={(e) => setQuestionForm({ ...questionForm, is_required: e.target.checked })} />} label="Required" />
          </Box>

          {/* Options for select types */}
          {showSelectTypes && (
            <>
              <TextField
                label="Add option (press Enter)"
                value={optionInput}
                onChange={(e) => setOptionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && optionInput.trim()) {
                    e.preventDefault();
                    if (!questionForm.options.includes(optionInput.trim())) {
                      setQuestionForm({ ...questionForm, options: [...questionForm.options, optionInput.trim()] });
                    }
                    setOptionInput("");
                  }
                }}
                fullWidth
              />
              {questionForm.options.length > 0 && (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {questionForm.options.map((o) => (
                    <Chip key={o} label={o} onDelete={() => setQuestionForm({ ...questionForm, options: questionForm.options.filter((x) => x !== o) })} />
                  ))}
                </Box>
              )}
            </>
          )}

          {/* Range settings */}
          {questionForm.answer_type === "range" && (
            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField label="Min" type="number" value={questionForm.range_min} onChange={(e) => setQuestionForm({ ...questionForm, range_min: parseInt(e.target.value) || 1 })} sx={{ width: 80 }} />
              <TextField label="Max" type="number" value={questionForm.range_max} onChange={(e) => setQuestionForm({ ...questionForm, range_max: parseInt(e.target.value) || 10 })} sx={{ width: 80 }} />
              <TextField label="Min Label" value={questionForm.range_min_label} onChange={(e) => setQuestionForm({ ...questionForm, range_min_label: e.target.value })} fullWidth />
              <TextField label="Max Label" value={questionForm.range_max_label} onChange={(e) => setQuestionForm({ ...questionForm, range_max_label: e.target.value })} fullWidth />
            </Box>
          )}

          {/* Score weights (shown when parent survey has scoring enabled) */}
          {activeSurvey?.scoring_enabled && (showSelectTypes || questionForm.answer_type === "range" || questionForm.answer_type === "yes_no") && (
            <>
              <Divider />
              <Typography variant="subtitle2">Score Weights</Typography>
              {(questionForm.answer_type === "yes_no" ? ["yes", "no"] : questionForm.options).map((opt) => (
                <Box key={opt} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography variant="body2" sx={{ minWidth: 120 }}>{opt}</Typography>
                  <TextField
                    size="small"
                    type="number"
                    value={questionForm.score_weights[opt] ?? ""}
                    onChange={(e) => setQuestionForm({
                      ...questionForm,
                      score_weights: { ...questionForm.score_weights, [opt]: parseFloat(e.target.value) || 0 },
                    })}
                    sx={{ width: 100 }}
                  />
                </Box>
              ))}
            </>
          )}

          <FormControl fullWidth>
            <InputLabel>Section</InputLabel>
            <Select label="Section" value={questionForm.section_id} onChange={(e) => setQuestionForm({ ...questionForm, section_id: e.target.value })}>
              {sections.map((s) => <MenuItem key={s.id} value={s.id}>{s.title}</MenuItem>)}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQuestionDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveQuestion} disabled={!questionForm.text || !questionForm.section_id}>Save</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
