import QuestionPrompt from "./QuestionPrompt";
import WorksheetOverlay from "./WorksheetOverlay";

// Everything chemistry draws on the page itself rather than in the panel.
//
// Both of these live in canvas coordinates, and they are mutually exclusive
// by construction: a worksheet labels every box, so there is nothing for the
// popover to offer and `questionCandidateRow` stays null. Topics without a
// worksheet -- balancing, structure -- get the popover instead.
export default function ChemistryPageOverlays({ chemistry, canvas }) {
  const candidateRow = chemistry.questionCandidateRow;

  return (
    <>
      {chemistry.worksheet && (
        <WorksheetOverlay
          worksheet={chemistry.worksheet}
          values={chemistry.values}
          targetPicture={chemistry.targetPicture}
          answerText={chemistry.answerText}
          answerVerdict={chemistry.answerVerdict}
          width={canvas.canvasWidth}
        />
      )}
      {candidateRow !== null && (
        <QuestionPrompt
          bounds={canvas.getRowBounds(candidateRow)}
          text={chemistry.lines.find((line) => line.row === candidateRow)?.text}
          verb={chemistry.questionVerb}
          onUseAsQuestion={() => chemistry.useRowAsQuestion(candidateRow)}
          onDismiss={() => chemistry.dismissQuestionCandidate(candidateRow)}
        />
      )}
    </>
  );
}
