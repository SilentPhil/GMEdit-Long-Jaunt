package gmk.snips;
import gml.Project;
import ui.GlobalSearch;

/**
 * ...
 * @author YellowAfterlife
 */
class GmkSnipsSearcher {
	public static function run(
		project:Project, fn:ProjectSearcher, done:Void->Void, opt:GlobalSearchOpt
	){
		if (opt.searchProgress != null) opt.searchProgress({
			done: 0,
			total: 0,
			cancelled: opt.searchCancelled != null && opt.searchCancelled(),
		});
		done();
	}
}
