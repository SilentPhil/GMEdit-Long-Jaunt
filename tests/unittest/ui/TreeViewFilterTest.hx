package ui;

import massive.munit.Assert;
import ui.treeview.TreeView;

class TreeViewFilterTest {
	@Test public function matchesSubstringIgnoringCase() {
		Assert.isTrue(TreeView.filterMatches("TutorialsOperator", "tutorial", false, false));
		Assert.isFalse(TreeView.filterMatches("TutorialsOperator", "tutorial", false, true));
	}

	@Test public function matchesWholeWordsOnlyAtBoundaries() {
		Assert.isTrue(TreeView.filterMatches("soft-tutorial-objectives", "tutorial", true, false));
		Assert.isFalse(TreeView.filterMatches("SoftTutorialObjectives", "tutorial", true, false));
		Assert.isFalse(TreeView.filterMatches("soft_tutorial_objectives", "tutorial", true, false));
	}

	@Test public function emptyFilterMatchesEveryResource() {
		Assert.isTrue(TreeView.filterMatches("Anything", "", true, true));
	}
}
