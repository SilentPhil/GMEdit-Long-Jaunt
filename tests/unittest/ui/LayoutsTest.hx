package ui;

import massive.munit.Assert;

@:access(ui.Layouts)
class LayoutsTest {
	@Test public function usesNormalizedLayoutNameForPath() {
		Assert.areEqual("#layouts/my_work_layout.json", Layouts.pathForName("My Work Layout"));
	}

	@Test public function replacesEverySpace() {
		Assert.areEqual("#layouts/two__spaces.json", Layouts.pathForName("Two  Spaces"));
	}
}
