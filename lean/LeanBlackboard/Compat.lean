import Lean

/-!
# Lean version compatibility

Lake builds this package with the toolchain of the project that requires it, so the same sources
must compile with more than one Lean version. Server helpers that moved between versions are
wrapped here; the rest of the package only uses these wrappers.
-/

namespace LeanBlackboard

open Lean Elab Command Server

/-- Elaborates the command only if the constant exists in this Lean version. -/
elab "when_const% " c:ident " do " cmd:command : command => do
  if (← getEnv).contains c.getId then elabCommand cmd

/-- Elaborates the command only if the constant does not exist in this Lean version. -/
elab "unless_const% " c:ident " do " cmd:command : command => do
  unless (← getEnv).contains c.getId do elabCommand cmd

-- Up to Lean 4.34 the lookups live in `Lean.Server.RequestM` and take the document.

when_const% Lean.Server.RequestM.findCmdParsedSnap do
/-- The first command snapshot containing `pos`, asynchronously. -/
def cmdParsedSnapAt (doc : FileWorker.EditableDocument) (pos : String.Pos.Raw) :
    ServerTask (Option Language.Lean.CommandParsedSnapshot) :=
  RequestM.findCmdParsedSnap doc pos

when_const% Lean.Server.RequestM.findInfoTreeAtPos do
/-- The info tree of the first snapshot task containing `pos`, asynchronously. -/
def infoTreeAtPos (doc : FileWorker.EditableDocument) (pos : String.Pos.Raw) (includeStop : Bool) :
    ServerTask (Option InfoTree) :=
  RequestM.findInfoTreeAtPos doc pos includeStop

-- From Lean 4.35 they live in `Lean.Language.Lean` and take the initial snapshot and the text.

unless_const% Lean.Server.RequestM.findCmdParsedSnap do
/-- The first command snapshot containing `pos`, asynchronously. -/
def cmdParsedSnapAt (doc : FileWorker.EditableDocument) (pos : String.Pos.Raw) :
    ServerTask (Option Language.Lean.CommandParsedSnapshot) :=
  (Language.Lean.findCmdParsedSnap doc.initSnap doc.meta.text pos).asServerTask

unless_const% Lean.Server.RequestM.findInfoTreeAtPos do
/-- The info tree of the first snapshot task containing `pos`, asynchronously. -/
def infoTreeAtPos (doc : FileWorker.EditableDocument) (pos : String.Pos.Raw) (includeStop : Bool) :
    ServerTask (Option InfoTree) :=
  (Language.Lean.findInfoTreeAtPos doc.initSnap doc.meta.text pos includeStop).asServerTask

end LeanBlackboard
